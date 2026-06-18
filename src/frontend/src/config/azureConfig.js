// Azure OpenAI Configuration - Load from environment variables
export const azureConfig = {
  endpoint: process.env.REACT_APP_AZURE_ENDPOINT || '',
  deployment: process.env.REACT_APP_AZURE_DEPLOYMENT || 'gpt-4.1',
  apiKey: process.env.REACT_APP_AZURE_API_KEY || '',
  apiVersion: process.env.REACT_APP_AZURE_API_VERSION || '2024-08-01-preview'
};
