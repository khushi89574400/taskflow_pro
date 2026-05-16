# TaskFlow Pro - Team Task Manager

TaskFlow Pro is a full-stack project and task management web app built for the assignment requirement: users can create projects, assign tasks, manage teams, and track progress with role-based access control.

## Live Demo
Add your Railway live URL here after deployment:

```txt
https://your-project-name.up.railway.app
```

## GitHub Repository
Add your GitHub repository link here:

```txt
https://github.com/your-username/your-repository
```

## Demo Admin Login

```txt
Email: admin@admin.com
Password: admin123
```

> Change the default password after first login using the Change Password option.

## Features

### Authentication
- Signup and login
- JWT-based authentication
- Password hashing using bcryptjs
- Change password option

### Role-Based Access Control
- **Admin**
  - Create, edit, and delete projects
  - Add team members to projects
  - Create, assign, edit, delete tasks
  - Update user roles
  - View all projects, users, and tasks
- **Member**
  - View projects where they are added as a member
  - Create tasks only in accessible projects
  - Update task status for accessible work
  - View teammates connected to their projects

### Project Management
- Project name, description, status
- Project-member relationship table
- Project progress percentage
- Member count, task count, completed count, overdue count

### Task Management
- Task title and description
- Project relationship
- Assignee relationship
- Status: To Do, In Progress, Done
- Priority: Low, Medium, High
- Due date and overdue highlighting
- Kanban board and table view

### Dashboard
- Total projects
- Total tasks
- In-progress tasks
- Completed tasks
- Overdue tasks
- Recent task updates
- Status progress bars

### UI Design
- Modern responsive dashboard
- Sidebar navigation
- Mobile-friendly layout
- Glassmorphism cards
- Kanban task board
- Clean project cards
- Toast notifications

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| Backend | Node.js, Express.js |
| Database | SQLite3 |
| Authentication | JWT, bcryptjs |
| Deployment | Railway |

## Database Tables

- `users`
- `projects`
- `project_members`
- `tasks`

The app automatically creates and migrates the required tables when the server starts. The local SQLite database file is generated automatically and is not required in GitHub.

## REST API Overview

### Auth
```txt
POST /api/signup
POST /api/login
POST /api/change-password
```

### Users
```txt
GET /api/users
PUT /api/users/:id/role
```

### Projects
```txt
GET /api/projects
POST /api/projects
PUT /api/projects/:id
DELETE /api/projects/:id
GET /api/projects/:id/members
PUT /api/projects/:id/members
```

### Tasks
```txt
GET /api/tasks
POST /api/tasks
PUT /api/tasks/:id
DELETE /api/tasks/:id
```

### Dashboard
```txt
GET /api/dashboard
GET /api/health
```

## Run Locally

### 1. Install dependencies
```bash
npm install
```

### 2. Start the server
```bash
npm start
```

### 3. Open in browser
```txt
http://localhost:3000
```

## Environment Variables

Create a `.env` file locally only if you are using an environment variable loader. On Railway, add these variables in the service Variables tab.

```txt
JWT_SECRET=use_a_long_random_secret_here
DATABASE_PATH=./database.sqlite
PORT=3000
```

`PORT` is automatically provided by Railway, so normally you do not need to set it manually.

## Deploy on Railway

### 1. Push project to GitHub
```bash
git add .
git commit -m "Upgrade TaskFlow Pro features and UI"
git push origin main
```

### 2. Redeploy on Railway
If your Railway project is already connected to GitHub, Railway should redeploy automatically after the push.

### 3. Railway settings
Use these values if Railway asks:

```txt
Build Command: npm install
Start Command: npm start
```

### 4. Add environment variable
```txt
JWT_SECRET=your_long_random_secret
```

### 5. Open the live URL
Use the Railway-generated domain and test:

```txt
/admin login
create project
add members
create task
update status
check dashboard
```

## Assignment Checklist

- [x] Authentication: Signup/Login
- [x] Project and team management
- [x] Task creation, assignment, and status tracking
- [x] Dashboard with task, status, and overdue tracking
- [x] REST APIs
- [x] SQLite database
- [x] Validations and relationships
- [x] Role-based access control
- [x] Railway-ready deployment
- [x] README included

## Folder Structure

```txt
TaskFlow-Pro/
├── index.html
├── server.js
├── package.json
├── package-lock.json
├── README.md
├── railway.json
├── .nvmrc
└── .gitignore
```

## Notes

SQLite is simple and suitable for assignment/demo deployment. For a large production application, use PostgreSQL or MySQL with Railway database service.
