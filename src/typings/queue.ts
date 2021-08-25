/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
type TaskRunnable = () => Promise<any>

interface Task {
  runnable: TaskRunnable,
  resolve: (value: any) => void,
  reject: (error: any) => void,
}
