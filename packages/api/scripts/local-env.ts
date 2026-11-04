// Defaults for running the API on this machine against DynamoDB Local.
// Anything already set in the environment wins.
process.env.APP_ENV ??= 'local';
process.env.TABLE_NAME ??= 'JobTracker';
process.env.AWS_REGION ??= 'us-east-1';
process.env.DYNAMO_ENDPOINT ??= 'http://localhost:8000';
