from shutil import disk_usage


class ContainerMetricsService:
    @staticmethod
    def collect():
        try:
            import docker

            client = docker.from_env()
            containers = client.containers.list()
        except Exception as exc:
            usage = disk_usage("/")
            return {
                "available": False,
                "error": str(exc),
                "host": {
                    "disk_total_bytes": usage.total,
                    "disk_used_bytes": usage.used,
                    "disk_free_bytes": usage.free,
                },
                "containers": [],
            }

        items = []
        for container in containers:
            try:
                stats = container.stats(stream=False)
            except Exception:
                stats = {}

            cpu_stats = stats.get("cpu_stats", {})
            precpu_stats = stats.get("precpu_stats", {})

            cpu_total = cpu_stats.get("cpu_usage", {}).get("total_usage", 0)
            precpu_total = precpu_stats.get("cpu_usage", {}).get("total_usage", 0)
            system_total = cpu_stats.get("system_cpu_usage", 0)
            presystem_total = precpu_stats.get("system_cpu_usage", 0)
            online_cpus = cpu_stats.get("online_cpus") or 1

            cpu_delta = cpu_total - precpu_total
            system_delta = system_total - presystem_total
            cpu_percent = 0.0
            if cpu_delta > 0 and system_delta > 0:
                cpu_percent = (cpu_delta / system_delta) * online_cpus * 100.0

            memory_stats = stats.get("memory_stats", {})
            networks = stats.get("networks", {})
            net_rx = sum((net.get("rx_bytes", 0) for net in networks.values()), 0)
            net_tx = sum((net.get("tx_bytes", 0) for net in networks.values()), 0)

            blk_stats = stats.get("blkio_stats", {}).get("io_service_bytes_recursive", []) or []
            block_read = sum((entry.get("value", 0) for entry in blk_stats if entry.get("op") == "Read"), 0)
            block_write = sum((entry.get("value", 0) for entry in blk_stats if entry.get("op") == "Write"), 0)

            items.append(
                {
                    "id": container.id,
                    "name": container.name,
                    "status": container.status,
                    "cpu_percent": round(cpu_percent, 3),
                    "memory_usage_bytes": memory_stats.get("usage", 0),
                    "memory_limit_bytes": memory_stats.get("limit", 0),
                    "network_rx_bytes": net_rx,
                    "network_tx_bytes": net_tx,
                    "block_read_bytes": block_read,
                    "block_write_bytes": block_write,
                }
            )

        usage = disk_usage("/")
        return {
            "available": True,
            "host": {
                "disk_total_bytes": usage.total,
                "disk_used_bytes": usage.used,
                "disk_free_bytes": usage.free,
            },
            "containers": items,
        }
