/* eslint-disable @typescript-eslint/no-explicit-any */
type TaskRunnable = () => Promise<any>

type Task = {
  runnable: TaskRunnable,
  resolve: (value: any) => void,
  reject: (error: any) => void,
}
