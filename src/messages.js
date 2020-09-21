const createMessage = (error, message) => ({
    error, message
})

export default {
    NOT_FOUND: createMessage('NOT_FOUND', 'Endpoint not found.'),
    MISSING_PARAMS: createMessage('MISSING_PARAMS', 'Missing parameters.')
}