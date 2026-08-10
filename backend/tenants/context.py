"""Request-scoped tenant context.

DATABASE_ROUTERS don't get direct access to the current request, so the
resolved tenant DB alias is stashed here (in a contextvar, safe under async
and threaded servers) by the middleware and read back by TenantRouter.
"""

from contextvars import ContextVar

_current_tenant_db = ContextVar('current_tenant_db', default=None)
_current_tenant = ContextVar('current_tenant', default=None)


def set_current_tenant(tenant, db_alias):
    _current_tenant.set(tenant)
    _current_tenant_db.set(db_alias)


def get_current_tenant_db():
    return _current_tenant_db.get()


def get_current_tenant():
    return _current_tenant.get()


def clear_current_tenant():
    _current_tenant.set(None)
    _current_tenant_db.set(None)
