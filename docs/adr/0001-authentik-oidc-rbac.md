# 1. Standalone Authentik IdP with App-Level OIDC PKCE and RBAC

Status: accepted

We need user authentication, 2FA, and three-tier role-based access control (`Viewer`, `Analyst`, `Admin`) for SocialEye on Coolify while keeping the identity provider reusable for other organization apps.

We decided to deploy Authentik as a standalone shared service on Coolify and integrate SocialEye via App-level OIDC Authorization Code Flow with PKCE in React and JWT/JWKS validation in FastAPI, mapping Authentik Role Groups (`socialeye-admins`, `socialeye-analysts`, `socialeye-viewers`) to canonical roles and rejecting ungrouped users with `403 Forbidden`.

We considered Traefik ForwardAuth (simpler proxy-level gating) and bundling Authentik inside SocialEye's `docker-compose.yml`, but rejected them because ForwardAuth ties authorization tightly to proxy headers rather than fine-grained FastAPI endpoint RBAC, and bundling Authentik prevents sharing SSO across other organization services.
