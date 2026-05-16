const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-before-production';
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'database.sqlite');

const db = new sqlite3.Database(DB_PATH);

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));

const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function callback(err) {
    if (err) reject(err);
    else resolve(this);
  });
});

const get = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => {
    if (err) reject(err);
    else resolve(row);
  });
});

const all = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) reject(err);
    else resolve(rows);
  });
});

async function ensureColumn(table, column, definition) {
  const columns = await all(`PRAGMA table_info(${table})`);
  if (!columns.some((item) => item.name === column)) {
    await run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

async function initializeDatabase() {
  await run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    owner_id INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(owner_id) REFERENCES users(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    project_id INTEGER NOT NULL,
    assignee_id INTEGER,
    status TEXT NOT NULL DEFAULT 'todo',
    priority TEXT NOT NULL DEFAULT 'medium',
    due_date TEXT,
    created_by INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id),
    FOREIGN KEY(assignee_id) REFERENCES users(id),
    FOREIGN KEY(created_by) REFERENCES users(id)
  )`);

  await ensureColumn('users', 'role', "TEXT NOT NULL DEFAULT 'member'");
  await ensureColumn('users', 'created_at', 'TEXT');
  await ensureColumn('projects', 'status', "TEXT NOT NULL DEFAULT 'active'");
  await ensureColumn('projects', 'owner_id', 'INTEGER');
  await ensureColumn('projects', 'created_at', 'TEXT');
  await ensureColumn('projects', 'updated_at', 'TEXT');
  await ensureColumn('tasks', 'description', "TEXT DEFAULT ''");
  await ensureColumn('tasks', 'priority', "TEXT NOT NULL DEFAULT 'medium'");
  await ensureColumn('tasks', 'created_by', 'INTEGER');
  await ensureColumn('tasks', 'created_at', 'TEXT');
  await ensureColumn('tasks', 'updated_at', 'TEXT');

  await run(`CREATE TABLE IF NOT EXISTS project_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    team_role TEXT NOT NULL DEFAULT 'member',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, user_id),
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  await run(`CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id)`);

  const adminHash = bcrypt.hashSync('admin123', 10);
  const existingAdmin = await get('SELECT id FROM users WHERE email = ?', ['admin@admin.com']);
  if (!existingAdmin) {
    await run('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', [
      'Admin', 'admin@admin.com', adminHash, 'admin'
    ]);
    console.log('Default admin created: admin@admin.com / admin123');
  } else {
    await run("UPDATE users SET role = 'admin' WHERE email = ?", ['admin@admin.com']);
  }

  await run("UPDATE users SET role = 'member' WHERE role IS NULL OR role = ''");
  await run("UPDATE projects SET status = 'active' WHERE status IS NULL OR status = ''");
  await run("UPDATE tasks SET status = 'todo' WHERE status IS NULL OR status = ''");
  await run("UPDATE tasks SET priority = 'medium' WHERE priority IS NULL OR priority = ''");
  await run("UPDATE users SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL OR created_at = ''");
  await run("UPDATE projects SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL OR created_at = ''");
  await run("UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL OR updated_at = ''");
  await run("UPDATE tasks SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL OR created_at = ''");
  await run("UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL OR updated_at = ''");

  const admin = await get("SELECT id FROM users WHERE email = 'admin@admin.com'");
  if (admin) {
    await run('UPDATE projects SET owner_id = ? WHERE owner_id IS NULL', [admin.id]);
    await run('UPDATE tasks SET created_by = ? WHERE created_by IS NULL', [admin.id]);

    const projects = await all('SELECT id, owner_id FROM projects');
    for (const project of projects) {
      await run('INSERT OR IGNORE INTO project_members (project_id, user_id, team_role) VALUES (?, ?, ?)', [
        project.id,
        project.owner_id || admin.id,
        'owner'
      ]);
      await run('INSERT OR IGNORE INTO project_members (project_id, user_id, team_role) VALUES (?, ?, ?)', [
        project.id,
        admin.id,
        'owner'
      ]);
    }

    const taskAssignees = await all('SELECT DISTINCT project_id, assignee_id FROM tasks WHERE assignee_id IS NOT NULL');
    for (const item of taskAssignees) {
      await run('INSERT OR IGNORE INTO project_members (project_id, user_id, team_role) VALUES (?, ?, ?)', [
        item.project_id,
        item.assignee_id,
        'member'
      ]);
    }
  }
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidDate(value) {
  return !value || /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Please login first.' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Session expired. Please login again.' });
    req.user = user;
    next();
  });
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
  next();
}

async function isProjectMember(projectId, userId) {
  const member = await get(
    'SELECT id FROM project_members WHERE project_id = ? AND user_id = ?',
    [projectId, userId]
  );
  return Boolean(member);
}

async function canAccessProject(req, projectId) {
  if (req.user.role === 'admin') return true;
  return isProjectMember(projectId, req.user.id);
}

async function getTaskById(id) {
  return get(`
    SELECT t.*, p.name AS project_name, u.name AS assignee_name, u.email AS assignee_email
    FROM tasks t
    LEFT JOIN projects p ON p.id = t.project_id
    LEFT JOIN users u ON u.id = t.assignee_id
    WHERE t.id = ?
  `, [id]);
}

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'TaskFlow Pro', time: new Date().toISOString() });
});

app.post('/api/signup', asyncHandler(async (req, res) => {
  const name = normalizeString(req.body.name);
  const email = normalizeString(req.body.email).toLowerCase();
  const password = normalizeString(req.body.password);

  if (name.length < 2) return res.status(400).json({ error: 'Name must be at least 2 characters.' });
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  const hash = bcrypt.hashSync(password, 10);
  try {
    const result = await run('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', [
      name, email, hash, 'member'
    ]);
    const user = { id: result.lastID, name, email, role: 'member' };
    res.status(201).json({ message: 'Account created successfully.', token: signToken(user), user });
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) return res.status(409).json({ error: 'Email already registered.' });
    throw error;
  }
}));

app.post('/api/login', asyncHandler(async (req, res) => {
  const email = normalizeString(req.body.email).toLowerCase();
  const password = normalizeString(req.body.password);

  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  const user = await get('SELECT * FROM users WHERE email = ?', [email]);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const safeUser = { id: user.id, name: user.name, email: user.email, role: user.role || 'member' };
  res.json({ token: signToken(safeUser), user: safeUser });
}));

app.post('/api/change-password', auth, asyncHandler(async (req, res) => {
  const currentPassword = normalizeString(req.body.currentPassword);
  const newPassword = normalizeString(req.body.newPassword);
  if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });

  const user = await get('SELECT password FROM users WHERE id = ?', [req.user.id]);
  if (!user || !bcrypt.compareSync(currentPassword, user.password)) {
    return res.status(400).json({ error: 'Current password is incorrect.' });
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  await run('UPDATE users SET password = ? WHERE id = ?', [hash, req.user.id]);
  res.json({ message: 'Password updated successfully.' });
}));

app.get('/api/users', auth, asyncHandler(async (req, res) => {
  if (req.user.role === 'admin') {
    const users = await all('SELECT id, name, email, role, created_at FROM users ORDER BY name ASC');
    return res.json(users);
  }

  const users = await all(`
    SELECT DISTINCT u.id, u.name, u.email, u.role, u.created_at
    FROM users u
    JOIN project_members pm ON pm.user_id = u.id
    WHERE pm.project_id IN (SELECT project_id FROM project_members WHERE user_id = ?)
    ORDER BY u.name ASC
  `, [req.user.id]);
  res.json(users);
}));

app.put('/api/users/:id/role', auth, requireAdmin, asyncHandler(async (req, res) => {
  const role = normalizeString(req.body.role).toLowerCase();
  if (!['admin', 'member'].includes(role)) return res.status(400).json({ error: 'Invalid role.' });
  await run('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
  res.json({ message: 'User role updated.' });
}));

app.get('/api/projects', auth, asyncHandler(async (req, res) => {
  const where = req.user.role === 'admin'
    ? ''
    : 'WHERE p.id IN (SELECT project_id FROM project_members WHERE user_id = ?)';
  const params = req.user.role === 'admin' ? [] : [req.user.id];

  const projects = await all(`
    SELECT
      p.*,
      owner.name AS owner_name,
      COUNT(DISTINCT pm.user_id) AS member_count,
      COUNT(DISTINCT t.id) AS task_count,
      SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) AS completed_count,
      SUM(CASE WHEN t.status != 'done' AND t.due_date IS NOT NULL AND t.due_date < date('now') THEN 1 ELSE 0 END) AS overdue_count
    FROM projects p
    LEFT JOIN users owner ON owner.id = p.owner_id
    LEFT JOIN project_members pm ON pm.project_id = p.id
    LEFT JOIN tasks t ON t.project_id = p.id
    ${where}
    GROUP BY p.id
    ORDER BY p.created_at DESC, p.id DESC
  `, params);

  res.json(projects.map((project) => ({
    ...project,
    member_count: Number(project.member_count || 0),
    task_count: Number(project.task_count || 0),
    completed_count: Number(project.completed_count || 0),
    overdue_count: Number(project.overdue_count || 0)
  })));
}));

app.post('/api/projects', auth, requireAdmin, asyncHandler(async (req, res) => {
  const name = normalizeString(req.body.name);
  const description = normalizeString(req.body.description);
  const status = normalizeString(req.body.status || 'active').toLowerCase();
  const memberIds = Array.isArray(req.body.memberIds) ? req.body.memberIds.map(Number).filter(Boolean) : [];

  if (name.length < 3) return res.status(400).json({ error: 'Project name must be at least 3 characters.' });
  if (!['active', 'on-hold', 'completed'].includes(status)) return res.status(400).json({ error: 'Invalid project status.' });

  const result = await run(
    'INSERT INTO projects (name, description, status, owner_id, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
    [name, description, status, req.user.id]
  );

  const projectId = result.lastID;
  const uniqueMembers = [...new Set([req.user.id, ...memberIds])];
  for (const userId of uniqueMembers) {
    const role = userId === req.user.id ? 'owner' : 'member';
    await run('INSERT OR IGNORE INTO project_members (project_id, user_id, team_role) VALUES (?, ?, ?)', [projectId, userId, role]);
  }

  res.status(201).json({ id: projectId, message: 'Project created successfully.' });
}));

app.put('/api/projects/:id', auth, requireAdmin, asyncHandler(async (req, res) => {
  const projectId = Number(req.params.id);
  const name = normalizeString(req.body.name);
  const description = normalizeString(req.body.description);
  const status = normalizeString(req.body.status || 'active').toLowerCase();

  if (name.length < 3) return res.status(400).json({ error: 'Project name must be at least 3 characters.' });
  if (!['active', 'on-hold', 'completed'].includes(status)) return res.status(400).json({ error: 'Invalid project status.' });

  const result = await run(
    'UPDATE projects SET name = ?, description = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [name, description, status, projectId]
  );
  if (result.changes === 0) return res.status(404).json({ error: 'Project not found.' });
  res.json({ message: 'Project updated successfully.' });
}));

app.delete('/api/projects/:id', auth, requireAdmin, asyncHandler(async (req, res) => {
  const projectId = Number(req.params.id);
  await run('DELETE FROM tasks WHERE project_id = ?', [projectId]);
  await run('DELETE FROM project_members WHERE project_id = ?', [projectId]);
  const result = await run('DELETE FROM projects WHERE id = ?', [projectId]);
  if (result.changes === 0) return res.status(404).json({ error: 'Project not found.' });
  res.json({ message: 'Project deleted successfully.' });
}));

app.get('/api/projects/:id/members', auth, asyncHandler(async (req, res) => {
  const projectId = Number(req.params.id);
  if (!(await canAccessProject(req, projectId))) return res.status(403).json({ error: 'You do not have access to this project.' });

  const members = await all(`
    SELECT u.id, u.name, u.email, u.role, pm.team_role
    FROM project_members pm
    JOIN users u ON u.id = pm.user_id
    WHERE pm.project_id = ?
    ORDER BY pm.team_role DESC, u.name ASC
  `, [projectId]);
  res.json(members);
}));

app.put('/api/projects/:id/members', auth, requireAdmin, asyncHandler(async (req, res) => {
  const projectId = Number(req.params.id);
  const project = await get('SELECT * FROM projects WHERE id = ?', [projectId]);
  if (!project) return res.status(404).json({ error: 'Project not found.' });

  const memberIds = Array.isArray(req.body.memberIds) ? req.body.memberIds.map(Number).filter(Boolean) : [];
  const uniqueMembers = [...new Set([project.owner_id || req.user.id, req.user.id, ...memberIds])];

  await run('DELETE FROM project_members WHERE project_id = ?', [projectId]);
  for (const userId of uniqueMembers) {
    const role = userId === (project.owner_id || req.user.id) ? 'owner' : 'member';
    await run('INSERT OR IGNORE INTO project_members (project_id, user_id, team_role) VALUES (?, ?, ?)', [projectId, userId, role]);
  }

  res.json({ message: 'Project team updated successfully.' });
}));

app.get('/api/tasks', auth, asyncHandler(async (req, res) => {
  const filters = [];
  const params = [];

  if (req.user.role !== 'admin') {
    filters.push(`(
      t.project_id IN (SELECT project_id FROM project_members WHERE user_id = ?)
      OR t.assignee_id = ?
    )`);
    params.push(req.user.id, req.user.id);
  }

  if (req.query.projectId) {
    filters.push('t.project_id = ?');
    params.push(Number(req.query.projectId));
  }

  if (req.query.status && ['todo', 'progress', 'done'].includes(req.query.status)) {
    filters.push('t.status = ?');
    params.push(req.query.status);
  }

  if (req.query.assigneeId) {
    filters.push('t.assignee_id = ?');
    params.push(Number(req.query.assigneeId));
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const tasks = await all(`
    SELECT
      t.*,
      p.name AS project_name,
      u.name AS assignee_name,
      u.email AS assignee_email,
      creator.name AS creator_name
    FROM tasks t
    LEFT JOIN projects p ON p.id = t.project_id
    LEFT JOIN users u ON u.id = t.assignee_id
    LEFT JOIN users creator ON creator.id = t.created_by
    ${where}
    ORDER BY
      CASE t.status WHEN 'todo' THEN 1 WHEN 'progress' THEN 2 ELSE 3 END,
      CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      COALESCE(t.due_date, '9999-12-31') ASC,
      t.id DESC
  `, params);

  res.json(tasks);
}));

app.post('/api/tasks', auth, asyncHandler(async (req, res) => {
  const title = normalizeString(req.body.title);
  const description = normalizeString(req.body.description);
  const projectId = Number(req.body.projectId);
  const status = normalizeString(req.body.status || 'todo').toLowerCase();
  const priority = normalizeString(req.body.priority || 'medium').toLowerCase();
  const dueDate = normalizeString(req.body.dueDate);
  let assigneeId = req.body.assigneeId ? Number(req.body.assigneeId) : null;

  if (title.length < 3) return res.status(400).json({ error: 'Task title must be at least 3 characters.' });
  if (!projectId) return res.status(400).json({ error: 'Please select a project.' });
  if (!['todo', 'progress', 'done'].includes(status)) return res.status(400).json({ error: 'Invalid task status.' });
  if (!['low', 'medium', 'high'].includes(priority)) return res.status(400).json({ error: 'Invalid task priority.' });
  if (!isValidDate(dueDate)) return res.status(400).json({ error: 'Due date must be in YYYY-MM-DD format.' });

  if (!(await canAccessProject(req, projectId))) return res.status(403).json({ error: 'You do not have access to this project.' });

  if (req.user.role !== 'admin') assigneeId = req.user.id;
  if (assigneeId && !(await isProjectMember(projectId, assigneeId))) {
    return res.status(400).json({ error: 'Assignee must be a member of the selected project.' });
  }

  const result = await run(`
    INSERT INTO tasks (title, description, project_id, assignee_id, status, priority, due_date, created_by, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `, [title, description, projectId, assigneeId, status, priority, dueDate || null, req.user.id]);

  res.status(201).json({ id: result.lastID, message: 'Task created successfully.' });
}));

app.put('/api/tasks/:id', auth, asyncHandler(async (req, res) => {
  const taskId = Number(req.params.id);
  const task = await getTaskById(taskId);
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  const memberCanUpdate = task.assignee_id === req.user.id || await isProjectMember(task.project_id, req.user.id);
  if (req.user.role !== 'admin' && !memberCanUpdate) {
    return res.status(403).json({ error: 'You can update only your accessible tasks.' });
  }

  const status = normalizeString(req.body.status || task.status).toLowerCase();
  if (!['todo', 'progress', 'done'].includes(status)) return res.status(400).json({ error: 'Invalid task status.' });

  if (req.user.role !== 'admin') {
    await run('UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, taskId]);
    return res.json({ message: 'Task status updated successfully.' });
  }

  const title = normalizeString(req.body.title || task.title);
  const description = normalizeString(req.body.description ?? task.description);
  const projectId = Number(req.body.projectId || task.project_id);
  const assigneeId = req.body.assigneeId ? Number(req.body.assigneeId) : null;
  const priority = normalizeString(req.body.priority || task.priority).toLowerCase();
  const dueDate = normalizeString(req.body.dueDate ?? task.due_date);

  if (title.length < 3) return res.status(400).json({ error: 'Task title must be at least 3 characters.' });
  if (!['low', 'medium', 'high'].includes(priority)) return res.status(400).json({ error: 'Invalid task priority.' });
  if (!isValidDate(dueDate)) return res.status(400).json({ error: 'Due date must be in YYYY-MM-DD format.' });
  if (assigneeId && !(await isProjectMember(projectId, assigneeId))) {
    return res.status(400).json({ error: 'Assignee must be a member of the selected project.' });
  }

  await run(`
    UPDATE tasks
    SET title = ?, description = ?, project_id = ?, assignee_id = ?, status = ?, priority = ?, due_date = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [title, description, projectId, assigneeId, status, priority, dueDate || null, taskId]);

  res.json({ message: 'Task updated successfully.' });
}));

app.delete('/api/tasks/:id', auth, requireAdmin, asyncHandler(async (req, res) => {
  const result = await run('DELETE FROM tasks WHERE id = ?', [req.params.id]);
  if (result.changes === 0) return res.status(404).json({ error: 'Task not found.' });
  res.json({ message: 'Task deleted successfully.' });
}));

app.get('/api/dashboard', auth, asyncHandler(async (req, res) => {
  const projectFilter = req.user.role === 'admin'
    ? ''
    : 'WHERE p.id IN (SELECT project_id FROM project_members WHERE user_id = ?)';
  const projectParams = req.user.role === 'admin' ? [] : [req.user.id];
  const taskFilter = req.user.role === 'admin'
    ? ''
    : `WHERE (t.project_id IN (SELECT project_id FROM project_members WHERE user_id = ?) OR t.assignee_id = ?)`;
  const taskParams = req.user.role === 'admin' ? [] : [req.user.id, req.user.id];

  const projectStats = await get(`SELECT COUNT(*) AS total FROM projects p ${projectFilter}`, projectParams);
  const taskStats = await get(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'todo' THEN 1 ELSE 0 END) AS todo,
      SUM(CASE WHEN status = 'progress' THEN 1 ELSE 0 END) AS progress,
      SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done,
      SUM(CASE WHEN status != 'done' AND due_date IS NOT NULL AND due_date < date('now') THEN 1 ELSE 0 END) AS overdue,
      SUM(CASE WHEN assignee_id = ? AND status != 'done' THEN 1 ELSE 0 END) AS my_open
    FROM tasks t
    ${taskFilter}
  `, [req.user.id, ...taskParams]);

  const recentTasks = await all(`
    SELECT t.*, p.name AS project_name, u.name AS assignee_name
    FROM tasks t
    LEFT JOIN projects p ON p.id = t.project_id
    LEFT JOIN users u ON u.id = t.assignee_id
    ${taskFilter}
    ORDER BY t.updated_at DESC, t.id DESC
    LIMIT 5
  `, taskParams);

  res.json({
    today: todayISO(),
    projects: Number(projectStats.total || 0),
    tasks: Number(taskStats.total || 0),
    todo: Number(taskStats.todo || 0),
    progress: Number(taskStats.progress || 0),
    completed: Number(taskStats.done || 0),
    overdue: Number(taskStats.overdue || 0),
    myOpen: Number(taskStats.my_open || 0),
    recentTasks
  });
}));

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => console.log(`TaskFlow Pro running on port ${PORT}`));
  })
  .catch((error) => {
    console.error('Database initialization failed:', error);
    process.exit(1);
  });
