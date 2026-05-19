"""Knowledge OS service — searchable vault for notes, prompts, ideas, docs."""
from pathlib import Path
from backend.extensions import db
from backend.models.knowledge import KnowledgeEntry
from backend.services.activity_service import ActivityService


class KnowledgeService:
    @staticmethod
    def ensure_platform_knowledge(user_id: str) -> dict:
        """Ensure platform docs/patterns exist for this user without manual action."""
        existing = KnowledgeEntry.query.filter_by(
            user_id=user_id,
            source="repo_api_docs",
            is_archived=False,
        ).count()
        if existing > 0:
            return {"bootstrapped": False, "reason": "already_present", "entries": existing}
        result = KnowledgeService.bootstrap_api_docs(user_id=user_id)
        return {"bootstrapped": True, **result}

    @staticmethod
    def create(user_id: str, data: dict) -> KnowledgeEntry:
        entry = KnowledgeEntry(
            user_id=user_id,
            title=data["title"],
            body=data["body"],
            category=data.get("category"),
            kind=data.get("kind", "note"),
            tags=data.get("tags"),
            is_pinned=data.get("is_pinned", False),
            source=data.get("source", "manual"),
        )
        db.session.add(entry)
        db.session.commit()
        ActivityService.log(user_id=user_id, message=f"Knowledge entry created: {entry.title}", level="info")
        return entry

    @staticmethod
    def update(entry_id: str, user_id: str, data: dict) -> KnowledgeEntry:
        entry = KnowledgeEntry.query.filter_by(id=entry_id, user_id=user_id).first_or_404()
        for field in ("title", "body", "category", "kind", "tags", "is_pinned", "is_archived"):
            if field in data:
                setattr(entry, field, data[field])
        entry.version = (entry.version or 1) + 1
        db.session.commit()
        return entry

    @staticmethod
    def search(user_id: str, q: str = "", kind: str = None, category: str = None,
               page: int = 1, limit: int = 20) -> dict:
        query = KnowledgeEntry.query.filter_by(user_id=user_id, is_archived=False)
        if q:
            term = f"%{q}%"
            query = query.filter(
                db.or_(
                    KnowledgeEntry.title.ilike(term),
                    KnowledgeEntry.body.ilike(term),
                    KnowledgeEntry.tags.ilike(term),
                )
            )
        if kind:
            query = query.filter_by(kind=kind)
        if category:
            query = query.filter_by(category=category)
        query = query.order_by(KnowledgeEntry.is_pinned.desc(), KnowledgeEntry.updated_at.desc())
        total = query.count()
        items = query.offset((page - 1) * limit).limit(limit).all()
        return {
            "items": [KnowledgeService._serialize(e) for e in items],
            "pagination": {"page": page, "limit": limit, "total": total},
        }

    @staticmethod
    def delete(entry_id: str, user_id: str):
        entry = KnowledgeEntry.query.filter_by(id=entry_id, user_id=user_id).first_or_404()
        entry.is_archived = True
        db.session.commit()

    @staticmethod
    def _serialize(e: KnowledgeEntry) -> dict:
        return {
            "id": e.id,
            "title": e.title,
            "body": e.body,
            "category": e.category,
            "kind": e.kind,
            "tags": [t.strip() for t in (e.tags or "").split(",") if t.strip()],
            "is_pinned": e.is_pinned,
            "source": e.source,
            "version": e.version,
            "created_at": e.created_at.isoformat() if e.created_at else None,
            "updated_at": e.updated_at.isoformat() if e.updated_at else None,
        }

    @staticmethod
    def bootstrap_api_docs(user_id: str) -> dict:
        """Import API-relevant docs from this repository into Knowledge OS."""
        repo_root = Path(__file__).resolve().parents[2]
        candidates = [
            repo_root / "README.md",
            repo_root / "API_TESTING.md",
            repo_root / "DEVELOPMENT.md",
            repo_root / "FILE_STRUCTURE.md",
            repo_root / "ARCHITECTURE.md",
        ]
        candidates.extend(sorted((repo_root / "backend" / "routes").glob("*.py")))
        candidates.extend(sorted((repo_root / "backend" / "services").glob("*.py")))
        candidates.extend(sorted((repo_root / "backend" / "models").glob("*.py")))
        modules_dir = repo_root / "modules"
        if modules_dir.exists():
            candidates.extend(sorted(modules_dir.glob("**/*.py")))
            candidates.extend(sorted(modules_dir.glob("**/*.json")))

        created = 0
        updated = 0
        scanned = 0

        for path in candidates:
            if not path.exists() or not path.is_file():
                continue
            try:
                body = path.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue

            if "/api/" not in body and "Blueprint(" not in body and "class " not in body and "def " not in body:
                continue

            scanned += 1
            rel = str(path.relative_to(repo_root)).replace("\\", "/")
            title = f"API Doc: {rel}"
            compact = body[:12000]

            entry = KnowledgeEntry.query.filter_by(
                user_id=user_id,
                title=title,
                source="repo_api_docs",
                is_archived=False,
            ).first()

            if entry:
                entry.body = compact
                entry.kind = "api_doc"
                entry.category = "api"
                entry.tags = "api,repo,docs"
                entry.version = (entry.version or 1) + 1
                updated += 1
            else:
                db.session.add(
                    KnowledgeEntry(
                        user_id=user_id,
                        title=title,
                        body=compact,
                        kind="api_doc",
                        category="api",
                        tags="api,repo,docs",
                        source="repo_api_docs",
                    )
                )
                created += 1

        db.session.commit()
        ActivityService.log(
            user_id=user_id,
            message=f"Knowledge API docs sync complete: +{created} created / {updated} updated",
            level="info",
        )
        return {
            "created": created,
            "updated": updated,
            "scanned": scanned,
        }
