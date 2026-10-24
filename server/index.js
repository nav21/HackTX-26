import 'dotenv/config';
import { app } from './app.js';
import { startScheduler } from './engine/scheduler.js';
import { isSupabaseConfigured } from './supabase.js';

const PORT = process.env.PORT || 3001;

app.listen(PORT, (err) => {
  if (err) throw err;
  console.log(`Server listening on http://localhost:${PORT}`);
  if (isSupabaseConfigured) startScheduler();
});
