def oauth_providers_config():
    # TODO: Wire Google/GitHub/Shopify OAuth providers with secure callback handlers.
    return {
        "google": {"enabled": False},
        "github": {"enabled": False},
        "shopify": {"enabled": False},
    }
