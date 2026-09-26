import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
const failures: string[] = []

const requiredFiles = [
  'src/app.ts',
  'src/server.ts',
  'src/config/env.ts',
  'src/middlewares/auth.middleware.ts',
  'src/middlewares/role.middleware.ts',
  'src/middlewares/error.middleware.ts',
  'src/services/auth.service.ts',
  'src/services/project.service.ts',
  'src/services/task.service.ts',
  'src/jobs/overdue.job.ts',
  'src/sockets/socket.ts',
  'prisma/schema.prisma',
  'prisma/seed.ts',
  'prisma/migrations/202609260001_init/migration.sql',
  '.env.example',
  'Dockerfile',
  'docker-compose.yml',
  'tsconfig.build.json',
  'README.md',
  'docs/API.md'
]

const read = (file: string): string => readFileSync(join(root, file), 'utf8')

for (const file of requiredFiles) {
  try {
    if (!statSync(join(root, file)).isFile()) failures.push(`Required file is not a file: ${file}`)
  } catch {
    failures.push(`Missing required file: ${file}`)
  }
}

const packageJson = JSON.parse(read('package.json')) as { scripts?: Record<string, string> }
if (packageJson.scripts?.start !== 'node dist/server.js') {
  failures.push('npm start must execute dist/server.js from tsconfig.build.json output.')
}
if (packageJson.scripts?.build !== 'tsc -p tsconfig.build.json') {
  failures.push('npm run build must use tsconfig.build.json.')
}

const routes = [
  '/login', '/refresh', '/logout', '/me',
  '/developers',
  '/:id', '/:projectId/tasks',
  '/recent', '/unread-count', '/read-all',
  '/admin', '/pm', '/developer'
]
const routeSource = readdirSync(join(root, 'src/routes'))
  .filter((name) => name.endsWith('.ts'))
  .map((name) => read(`src/routes/${name}`))
  .join('\n')
for (const route of routes) {
  if (!routeSource.includes(route)) failures.push(`Expected route fragment not found: ${route}`)
}



const projectRoutes = read('src/routes/project.routes.ts')
if (!projectRoutes.includes("get('/:projectId/tasks', requireRole(Role.ADMIN, Role.PROJECT_MANAGER)")) {
  failures.push('Nested project task listing must be restricted to admins and project managers.')
}
if (!projectRoutes.includes("delete('/:id', requireRole(Role.ADMIN, Role.PROJECT_MANAGER)")) {
  failures.push('Owning project managers must be allowed to manage/delete their own projects; service ownership checks apply.')
}

const clientRoutes = read('src/routes/client.routes.ts')
if (!clientRoutes.includes("get('/', requireRole(Role.ADMIN, Role.PROJECT_MANAGER)")) {
  failures.push('Project managers must have read-only client-list access for project assignment.')
}
if (!clientRoutes.includes("post('/', requireRole(Role.ADMIN)")) {
  failures.push('Client creation must remain admin-only.')
}
const userRoutes = read('src/routes/user.routes.ts')
if (!userRoutes.includes("get('/developers', requireRole(Role.ADMIN, Role.PROJECT_MANAGER)")) {
  failures.push('Active developer directory must be available to admins and project managers.')
}
if (!userRoutes.includes("post('/', requireRole(Role.ADMIN)")) {
  failures.push('General user creation must remain admin-only.')
}

const prismaSchema = read('prisma/schema.prisma')
for (const model of ['User', 'RefreshToken', 'Client', 'Project', 'Task', 'ActivityLog', 'Notification']) {
  if (!prismaSchema.includes(`model ${model} {`)) failures.push(`Missing Prisma model: ${model}`)
}
for (const role of ['ADMIN', 'PROJECT_MANAGER', 'DEVELOPER']) {
  if (!prismaSchema.includes(role)) failures.push(`Missing role: ${role}`)
}

const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const full = join(dir, name)
  return statSync(full).isDirectory() ? walk(full) : [full]
})

const srcFiles = walk(join(root, 'src'))
for (const file of srcFiles) {
  if (!file.endsWith('.ts')) failures.push(`Non-TypeScript backend source file: ${relative(root, file)}`)
}

const scannedFiles = [...srcFiles, ...walk(join(root, 'prisma')).filter((file) => file.endsWith('.ts'))]
for (const file of scannedFiles) {
  const content = readFileSync(file, 'utf8')
  if (/\bdebugger\b/.test(content)) failures.push(`debugger found: ${relative(root, file)}`)
  if (/console\.log\s*\(/.test(content)) failures.push(`console.log found: ${relative(root, file)}`)
  if (/\bFIXME\b/.test(content)) failures.push(`FIXME found: ${relative(root, file)}`)
  if (/\bTODO\s*[:\-]/.test(content)) failures.push(`TODO marker found: ${relative(root, file)}`)
}

const auth = read('src/services/auth.service.ts')
if (!auth.includes('hashToken(rawToken)') || !auth.includes('TransactionIsolationLevel.Serializable')) {
  failures.push('Refresh-token hashing/serializable rotation checks are missing.')
}

const task = read('src/services/task.service.ts')
for (const marker of ['activityLog.create', 'notification.create', "eventBus.emit('activityCreated'", 'updateMany']) {
  if (!task.includes(marker)) failures.push(`Task transactional/event marker missing: ${marker}`)
}

const socket = read('src/sockets/socket.ts')
for (const marker of ['project:join', 'activity:catchup', 'notification:unread-count', 'presence:count', 'verifyAccessToken']) {
  if (!socket.includes(marker)) failures.push(`Socket marker missing: ${marker}`)
}

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`FAIL ${failure}\n`)
  process.exitCode = 1
} else {
  process.stdout.write('PASS backend static audit\n')
}
