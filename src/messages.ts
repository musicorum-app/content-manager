const createMessage = (error: string, message: string) => ({
  error, message
})

export default {
  NOT_FOUND: createMessage('NOT_FOUND', 'Endpoint not found.'),
  MISSING_PARAMS: createMessage('MISSING_PARAMS', 'Missing parameters.'),
  INTERNAL_ERROR: createMessage('INTERNAL_ERROR', 'Internal error.')
}
