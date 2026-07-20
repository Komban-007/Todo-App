const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'db.json');

// Middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper functions for file DB operations
async function readDB() {
  try {
    const data = await fs.readFile(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // If file doesn't exist, return default structure
    return { tasks: [], categories: ["Work", "Personal", "Shopping", "Health", "Finance"] };
  }
}

async function writeDB(data) {
  await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// API Routes

// GET: All tasks
app.get('/api/tasks', async (req, res) => {
  try {
    const db = await readDB();
    res.json(db.tasks);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read database' });
  }
});

// GET: All categories
app.get('/api/categories', async (req, res) => {
  try {
    const db = await readDB();
    res.json(db.categories);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read database' });
  }
});

// POST: Add custom category
app.post('/api/categories', async (req, res) => {
  try {
    const { category } = req.body;
    if (!category || typeof category !== 'string' || category.trim() === '') {
      return res.status(400).json({ error: 'Invalid category name' });
    }
    const trimmedCategory = category.trim();
    const db = await readDB();
    if (!db.categories.includes(trimmedCategory)) {
      db.categories.push(trimmedCategory);
      await writeDB(db);
    }
    res.status(201).json(db.categories);
  } catch (error) {
    res.status(500).json({ error: 'Failed to save category' });
  }
});

// POST: Create a task
app.post('/api/tasks', async (req, res) => {
  try {
    const { title, description, dueDate, priority, category, recurring } = req.body;
    if (!title || title.trim() === '') {
      return res.status(400).json({ error: 'Task title is required' });
    }

    const db = await readDB();
    
    const newTask = {
      id: Date.now().toString(),
      title: title.trim(),
      description: (description || '').trim(),
      dueDate: dueDate || null,
      priority: priority || 'Medium',
      category: category || 'General',
      completed: false,
      recurring: recurring || 'none', // none, daily, weekly, monthly
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.tasks.push(newTask);
    await writeDB(db);
    
    res.status(201).json(newTask);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// PUT: Update a task
app.put('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const db = await readDB();
    
    const taskIndex = db.tasks.findIndex(t => t.id === id);
    if (taskIndex === -1) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const currentTask = db.tasks[taskIndex];
    
    // Apply updates and bump updatedAt
    const updatedTask = {
      ...currentTask,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    // Prevent direct editing of ID or createdAt
    updatedTask.id = currentTask.id;
    updatedTask.createdAt = currentTask.createdAt;

    db.tasks[taskIndex] = updatedTask;
    await writeDB(db);
    
    res.json(updatedTask);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// DELETE: Remove a task
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await readDB();
    
    const initialLength = db.tasks.length;
    db.tasks = db.tasks.filter(t => t.id !== id);
    
    if (db.tasks.length === initialLength) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    await writeDB(db);
    res.json({ message: 'Task deleted successfully', id });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// POST: Sync offline-created/modified tasks
app.post('/api/tasks/sync', async (req, res) => {
  try {
    const { tasks: clientTasks } = req.body;
    if (!Array.isArray(clientTasks)) {
      return res.status(400).json({ error: 'Invalid sync payload' });
    }

    const db = await readDB();
    const serverTasksMap = new Map(db.tasks.map(t => [t.id, t]));

    for (const clientTask of clientTasks) {
      const serverTask = serverTasksMap.get(clientTask.id);
      if (!serverTask) {
        // Task created offline and doesn't exist on server
        serverTasksMap.set(clientTask.id, clientTask);
      } else {
        // Resolve conflicts using updatedAt timestamp
        const clientTime = new Date(clientTask.updatedAt || 0).getTime();
        const serverTime = new Date(serverTask.updatedAt || 0).getTime();
        if (clientTime > serverTime) {
          serverTasksMap.set(clientTask.id, { ...serverTask, ...clientTask });
        }
      }
    }

    db.tasks = Array.from(serverTasksMap.values());
    await writeDB(db);
    res.json(db.tasks);
  } catch (error) {
    res.status(500).json({ error: 'Sync failed' });
  }
});

// Fallback to serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
