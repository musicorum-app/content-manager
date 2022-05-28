export type TaskRunnable<R = any> = () => Promise<R>

export interface Task<R = any> {
  runnable: TaskRunnable<R>,
  resolve: (value: R) => void,
  reject: (error: Error) => void,
}
