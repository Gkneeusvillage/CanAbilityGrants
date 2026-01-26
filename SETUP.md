# Setup Instructions

## Local Development

1. **Get a Google Gemini API Key**
   - Go to https://aistudio.google.com/apikey
   - Sign in with your Google account
   - Create a new API key
   - Copy the API key

2. **Configure the API Key Locally**
   - Open `.env.local` in this directory
   - Replace `PLACEHOLDER_API_KEY` with your actual API key:
     ```
     API_KEY=your_actual_api_key_here
     ```
   - Save the file

3. **Install Dependencies**
   ```bash
   npm install
   ```

4. **Run the Development Server**
   ```bash
   npm run dev
   ```

## Vercel Deployment

To fix the production deployment on Vercel:

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add a new environment variable:
   - **Name**: `API_KEY`
   - **Value**: Your Google Gemini API key
   - **Environments**: Check all (Production, Preview, Development)
4. Click **Save**
5. Redeploy your application:
   - Go to **Deployments** tab
   - Click the three dots (...) on the latest deployment
   - Click **Redeploy**

## Important Security Notes

- **Never commit your actual API key to git**
- The `.env.local` file should remain in `.gitignore`
- Only use placeholder values in version control
- Set the real API key in Vercel's environment variables dashboard

## Troubleshooting

If you see "API_KEY is missing from environment variables":
- For local development: Check that `.env.local` has the correct `API_KEY=your_key`
- For Vercel: Ensure the environment variable is set in Vercel dashboard and redeploy
