export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Real-Time Client Project Dashboard API',
    version: '1.0.0',
    description: 'Role-based project dashboard backend with persistent activity, notifications and Socket.IO.'
  },
  servers: [{ url: '/' }],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } }
        }
      }
    }
  },
  paths: {
    '/health': { get: { summary: 'Health check', responses: { '200': { description: 'Healthy' } } } },
    '/api/health': { get: { summary: 'API health check', responses: { '200': { description: 'Healthy' } } } },
    '/api/auth/login': { post: { summary: 'Login', requestBody: { required: true }, responses: { '200': { description: 'Access token and user; refresh token is HttpOnly cookie' }, '401': { description: 'Invalid credentials' } } } },
    '/api/auth/refresh': { post: { summary: 'Rotate refresh session', responses: { '200': { description: 'New access token and rotated refresh cookie' }, '401': { description: 'Invalid, expired or revoked refresh session' }, '409': { description: 'Concurrent refresh race' } } } },
    '/api/auth/logout': { post: { summary: 'Revoke current refresh session', responses: { '200': { description: 'Logged out' } } } },
    '/api/auth/me': {
      get: { summary: 'Current user', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Current user' } } },
      patch: { summary: 'Update own display name', description: 'Authenticated users can update only their own name.', security: [{ bearerAuth: [] }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name'], additionalProperties: false, properties: { name: { type: 'string', minLength: 2, maxLength: 100 } } } } } }, responses: { '200': { description: 'Updated current user' } } }
    },
    '/api/users/developers': { get: { summary: 'List active developers for assignment', description: 'ADMIN or PROJECT_MANAGER. Returns safe public assignment fields only.', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Active developer directory' }, '401': { description: 'Authentication required' }, '403': { description: 'Role not allowed' } } } },
    '/api/users': {
      get: { summary: 'List users', description: 'ADMIN', security: [{ bearerAuth: [] }], parameters: [{ name: 'page', in: 'query' }, { name: 'limit', in: 'query' }, { name: 'role', in: 'query' }, { name: 'isActive', in: 'query' }, { name: 'search', in: 'query' }], responses: { '200': { description: 'Paginated users' }, '403': { description: 'Admin required' } } },
      post: { summary: 'Create user', description: 'ADMIN', security: [{ bearerAuth: [] }], responses: { '201': { description: 'Created' } } }
    },
    '/api/users/{id}': {
      get: { summary: 'Get user', description: 'ADMIN', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true }], responses: { '200': { description: 'User' }, '404': { description: 'Not found' } } },
      patch: { summary: 'Update user', description: 'ADMIN', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true }], responses: { '200': { description: 'Updated' } } }
    },
    '/api/clients': {
      get: { summary: 'List clients', description: 'ADMIN or PROJECT_MANAGER. PROJECT_MANAGER access is read-only so projects can be assigned to clients.', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Paginated clients' }, '403': { description: 'Role not allowed' } } },
      post: { summary: 'Create client', description: 'ADMIN', security: [{ bearerAuth: [] }], responses: { '201': { description: 'Created' } } }
    },
    '/api/clients/{id}': {
      get: { summary: 'Get client', description: 'ADMIN or PROJECT_MANAGER read-only', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true }], responses: { '200': { description: 'Client' }, '403': { description: 'Role not allowed' }, '404': { description: 'Not found' } } },
      patch: { summary: 'Update client', description: 'ADMIN', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true }], responses: { '200': { description: 'Updated' } } },
      delete: { summary: 'Delete client', description: 'ADMIN', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true }], responses: { '200': { description: 'Deleted' } } }
    },
    '/api/projects': {
      get: { summary: 'List role-scoped projects', security: [{ bearerAuth: [] }], parameters: [{ name: 'page', in: 'query' }, { name: 'limit', in: 'query' }, { name: 'status', in: 'query' }, { name: 'clientId', in: 'query' }, { name: 'search', in: 'query' }], responses: { '200': { description: 'Projects' } } },
      post: { summary: 'Create project', description: 'ADMIN or PROJECT_MANAGER. Admin supplies createdById for an active PM.', security: [{ bearerAuth: [] }], responses: { '201': { description: 'Created' } } }
    },
    '/api/projects/{id}': {
      get: { summary: 'Get role-scoped project', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true }], responses: { '200': { description: 'Project' }, '404': { description: 'Not found or inaccessible' } } },
      patch: { summary: 'Update project', description: 'ADMIN or owning PROJECT_MANAGER', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true }], responses: { '200': { description: 'Updated' }, '403': { description: 'Forbidden' } } },
      delete: { summary: 'Delete project', description: 'ADMIN or owning PROJECT_MANAGER', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true }], responses: { '200': { description: 'Deleted' } } }
    },
    '/api/projects/{projectId}/tasks': {
      get: { summary: 'List role-scoped tasks inside project', description: 'ADMIN or owning PROJECT_MANAGER', security: [{ bearerAuth: [] }], parameters: [{ name: 'projectId', in: 'path', required: true }, { name: 'status', in: 'query' }, { name: 'priority', in: 'query' }, { name: 'dueDateFrom', in: 'query' }, { name: 'dueDateTo', in: 'query' }, { name: 'page', in: 'query' }, { name: 'limit', in: 'query' }], responses: { '200': { description: 'Tasks' } } },
      post: { summary: 'Create task', description: 'ADMIN or owning PROJECT_MANAGER', security: [{ bearerAuth: [] }], parameters: [{ name: 'projectId', in: 'path', required: true }], responses: { '201': { description: 'Created' } } }
    },
    '/api/tasks': { get: { summary: 'List role-scoped tasks', security: [{ bearerAuth: [] }], parameters: [{ name: 'search', in: 'query' }, { name: 'status', in: 'query' }, { name: 'priority', in: 'query' }, { name: 'dueDateFrom', in: 'query' }, { name: 'dueDateTo', in: 'query' }, { name: 'page', in: 'query' }, { name: 'limit', in: 'query' }], responses: { '200': { description: 'Tasks' }, '422': { description: 'Invalid date range' } } } },
    '/api/tasks/{id}': {
      get: { summary: 'Get accessible task', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true }], responses: { '200': { description: 'Task' }, '404': { description: 'Not found or inaccessible' } } },
      patch: { summary: 'Update task', description: 'ADMIN/owning PM can edit; DEVELOPER can only change status of their assigned task. Optimistic concurrency is enforced.', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true }], responses: { '200': { description: 'Updated' }, '403': { description: 'Forbidden' }, '409': { description: 'Concurrent update' } } }
    },
    '/api/activity': { get: { summary: 'Paginated role-filtered activity', security: [{ bearerAuth: [] }], parameters: [{ name: 'page', in: 'query' }, { name: 'limit', in: 'query' }, { name: 'projectId', in: 'query' }, { name: 'taskId', in: 'query' }], responses: { '200': { description: 'Activity' } } } },
    '/api/activity/recent': { get: { summary: 'Latest authorized activity for reconnect catch-up', security: [{ bearerAuth: [] }], parameters: [{ name: 'limit', in: 'query' }], responses: { '200': { description: 'Latest activity' } } } },
    '/api/notifications': { get: { summary: 'Own notifications only', security: [{ bearerAuth: [] }], parameters: [{ name: 'page', in: 'query' }, { name: 'limit', in: 'query' }, { name: 'isRead', in: 'query' }], responses: { '200': { description: 'Notifications' } } } },
    '/api/notifications/{id}/read': { patch: { summary: 'Mark own notification read', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true }], responses: { '200': { description: 'Updated' }, '404': { description: 'Not found or not owned' } } } },
    '/api/notifications/read-all': { patch: { summary: 'Mark all own notifications read', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Updated' } } } },
    '/api/notifications/unread-count': { get: { summary: 'Own unread count', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Count' } } } },
    '/api/dashboard/admin': { get: { summary: 'Admin dashboard', description: 'ADMIN', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Global metrics' } } } },
    '/api/dashboard/pm': { get: { summary: 'Project manager dashboard', description: 'PROJECT_MANAGER', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Scoped PM metrics' } } } },
    '/api/dashboard/developer': { get: { summary: 'Developer dashboard', description: 'DEVELOPER', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Assigned tasks only' } } } }
  }
} as const
