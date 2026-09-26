import bcrypt from 'bcryptjs'
import {
  ActivityEventType,
  NotificationType,
  PrismaClient,
  ProjectStatus,
  Role,
  TaskPriority,
  TaskStatus
} from '@prisma/client'

const prisma = new PrismaClient()

const daysFromNow = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000)

async function main() {
  await prisma.notification.deleteMany()
  await prisma.activityLog.deleteMany()
  await prisma.task.deleteMany()
  await prisma.project.deleteMany()
  await prisma.client.deleteMany()
  await prisma.refreshToken.deleteMany()
  await prisma.user.deleteMany()

  const [adminHash, managerHash, developerHash] = await Promise.all([
    bcrypt.hash('Admin123!', 12),
    bcrypt.hash('Manager123!', 12),
    bcrypt.hash('Developer123!', 12)
  ])

  const admin = await prisma.user.create({
    data: { name: 'Aarav Admin', email: 'admin@dashboard.test', passwordHash: adminHash, role: Role.ADMIN }
  })
  const pm1 = await prisma.user.create({
    data: { name: 'Priya Manager', email: 'pm1@dashboard.test', passwordHash: managerHash, role: Role.PROJECT_MANAGER }
  })
  const pm2 = await prisma.user.create({
    data: { name: 'Kabir Manager', email: 'pm2@dashboard.test', passwordHash: managerHash, role: Role.PROJECT_MANAGER }
  })

  const developers = []
  for (let i = 1; i <= 4; i += 1) {
    developers.push(await prisma.user.create({
      data: { name: `Developer ${i}`, email: `dev${i}@dashboard.test`, passwordHash: developerHash, role: Role.DEVELOPER }
    }))
  }

  const clients = await Promise.all([
    prisma.client.create({ data: { name: 'Meera Shah', email: 'meera@novaworks.test', company: 'NovaWorks', phone: '+91-9000000001' } }),
    prisma.client.create({ data: { name: 'Rohan Sen', email: 'rohan@orbitlabs.test', company: 'Orbit Labs', phone: '+91-9000000002' } }),
    prisma.client.create({ data: { name: 'Zoya Khan', email: 'zoya@brightpath.test', company: 'BrightPath', phone: '+91-9000000003' } })
  ])

  const projects = await Promise.all([
    prisma.project.create({ data: { name: 'Nova Client Portal', description: 'Client onboarding and project visibility portal', clientId: clients[0]!.id, createdById: pm1.id, status: ProjectStatus.ACTIVE } }),
    prisma.project.create({ data: { name: 'Orbit Analytics', description: 'Operational analytics dashboard', clientId: clients[1]!.id, createdById: pm1.id, status: ProjectStatus.ACTIVE } }),
    prisma.project.create({ data: { name: 'BrightPath Mobile API', description: 'Backend services for the mobile product', clientId: clients[2]!.id, createdById: pm2.id, status: ProjectStatus.PLANNING } })
  ])

  const statuses = [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.IN_REVIEW, TaskStatus.DONE]
  const priorities = [TaskPriority.LOW, TaskPriority.MEDIUM, TaskPriority.HIGH, TaskPriority.CRITICAL]
  const tasks = []

  for (let p = 0; p < projects.length; p += 1) {
    for (let i = 0; i < 5; i += 1) {
      const status = statuses[(p + i) % statuses.length]!
      const dueDate = i < 2 ? daysFromNow(-2 - i) : daysFromNow(2 + i)
      tasks.push(await prisma.task.create({
        data: {
          projectId: projects[p]!.id,
          title: `Project ${p + 1} Task ${i + 1}`,
          description: `Seed task ${i + 1} for ${projects[p]!.name}`,
          assignedDeveloperId: developers[(p + i) % developers.length]!.id,
          status,
          priority: priorities[(p + i) % priorities.length]!,
          dueDate,
          isOverdue: dueDate < new Date() && status !== TaskStatus.DONE
        }
      }))
    }
  }

  for (const task of tasks.slice(0, 8)) {
    const project = projects.find((item) => item.id === task.projectId)
    if (!project) continue
    const actorId = project.createdById
    await prisma.activityLog.create({
      data: {
        taskId: task.id,
        projectId: task.projectId,
        actorId,
        eventType: ActivityEventType.TASK_STATUS_CHANGED,
        fromStatus: TaskStatus.TODO,
        toStatus: task.status,
        message: `${task.title} status recorded during seed`
      }
    })
  }

  for (const task of tasks.slice(0, 6)) {
    if (!task.assignedDeveloperId) continue
    await prisma.notification.create({
      data: {
        recipientId: task.assignedDeveloperId,
        actorId: admin.id,
        taskId: task.id,
        projectId: task.projectId,
        type: NotificationType.TASK_ASSIGNED,
        message: `Seed notification for ${task.title}`
      }
    })
  }
}

main()
  .finally(async () => prisma.$disconnect())
