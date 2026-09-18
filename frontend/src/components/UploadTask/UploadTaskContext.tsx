import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  listUploadTasks,
  pauseUploadTask,
  resumeUploadTask,
  retryUploadTask,
  stopUploadTask,
} from '@/services/chatchat/kb';

export type UploadTaskItem = {
  id: number;
  task_id: string;
  file_name: string;
  file_size: number;
  status: string;
  stage: string;
  progress: number;
  docs_count: number;
  error: string;
};

export type UploadTask = {
  id: string;
  kb_name: string;
  status: string;
  total: number;
  done: number;
  failed: number;
  current_file: string;
  message: string;
  percent: number;
  create_time: string;
  update_time: string;
  items: UploadTaskItem[];
};

type UploadTaskContextValue = {
  tasks: UploadTask[];
  activeTaskId?: string;
  panelOpen: boolean;
  minimized: boolean;
  setPanelOpen: (open: boolean) => void;
  setMinimized: (min: boolean) => void;
  openTask: (taskId: string, opts?: { minimize?: boolean }) => void;
  refreshTasks: () => Promise<void>;
  pause: (taskId: string) => Promise<void>;
  resume: (taskId: string) => Promise<void>;
  stop: (taskId: string) => Promise<void>;
  retry: (taskId: string) => Promise<void>;
  activeTask?: UploadTask;
  runningCount: number;
};

const UploadTaskContext = createContext<UploadTaskContextValue | null>(null);

export const UploadTaskProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string>();
  const [panelOpen, setPanelOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const pollRef = useRef<number>();

  const refreshTasks = useCallback(async () => {
    try {
      const res = await listUploadTasks({ limit: 30 });
      if (res?.code === 200 && Array.isArray(res.data)) {
        setTasks(res.data);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const openTask = useCallback((taskId: string, opts?: { minimize?: boolean }) => {
    setActiveTaskId(taskId);
    if (opts?.minimize) {
      setMinimized(true);
      setPanelOpen(false);
    } else {
      setMinimized(false);
      setPanelOpen(true);
    }
  }, []);

  const pause = useCallback(
    async (taskId: string) => {
      await pauseUploadTask(taskId);
      await refreshTasks();
    },
    [refreshTasks],
  );

  const resume = useCallback(
    async (taskId: string) => {
      await resumeUploadTask(taskId);
      await refreshTasks();
      openTask(taskId);
    },
    [refreshTasks, openTask],
  );

  const stop = useCallback(
    async (taskId: string) => {
      await stopUploadTask(taskId);
      await refreshTasks();
    },
    [refreshTasks],
  );

  const retry = useCallback(
    async (taskId: string) => {
      await retryUploadTask(taskId);
      await refreshTasks();
      openTask(taskId);
    },
    [refreshTasks, openTask],
  );

  useEffect(() => {
    refreshTasks();
  }, [refreshTasks]);

  const hasLiveTask = tasks.some((t) => ['pending', 'running', 'paused'].includes(t.status));

  useEffect(() => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = undefined;
    }
    if (!(hasLiveTask || panelOpen || minimized)) {
      return;
    }
    pollRef.current = window.setInterval(() => {
      refreshTasks();
    }, 2000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [hasLiveTask, panelOpen, minimized, refreshTasks]);

  const activeTask = useMemo(
    () => tasks.find((t) => t.id === activeTaskId),
    [tasks, activeTaskId],
  );

  const runningCount = useMemo(
    () => tasks.filter((t) => ['pending', 'running', 'paused'].includes(t.status)).length,
    [tasks],
  );

  const value = useMemo(
    () => ({
      tasks,
      activeTaskId,
      panelOpen,
      minimized,
      setPanelOpen,
      setMinimized,
      openTask,
      refreshTasks,
      pause,
      resume,
      stop,
      retry,
      activeTask,
      runningCount,
    }),
    [
      tasks,
      activeTaskId,
      panelOpen,
      minimized,
      openTask,
      refreshTasks,
      pause,
      resume,
      stop,
      retry,
      activeTask,
      runningCount,
    ],
  );

  return <UploadTaskContext.Provider value={value}>{children}</UploadTaskContext.Provider>;
};

export function useUploadTasks() {
  const ctx = useContext(UploadTaskContext);
  if (!ctx) {
    throw new Error('useUploadTasks must be used within UploadTaskProvider');
  }
  return ctx;
}
