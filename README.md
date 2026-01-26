# Canadian Ability Grant Advisor

An empathetic AI agent designed to help users with Grade 3 reading levels access complex government grants by managing the search, clarification, and form-filling process.

## Local Development

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   Create a `.env` file in the root directory and add your Google Gemini API key:
   ```env
   API_KEY=your_actual_api_key_here
   ```

3. **Run Development Server**
   ```bash
   npm run dev
   ```

## Deployment to GitHub Pages

This project includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that automatically builds and deploys the application to GitHub Pages whenever you push to the `main` branch.

**Critical Step:** You must add your API Key to GitHub Secrets for the build to work.

### How to Add the API Key to GitHub Secrets

1. Navigate to your repository on **GitHub**.
2. Click on the **Settings** tab (usually the rightmost tab in the top navigation bar).
3. In the left sidebar, scroll down to the **Security** section.
4. Expand **Secrets and variables** and click on **Actions**.
5. Click the green **New repository secret** button.
6. Enter the following details:
   - **Name:** `API_KEY`
   - **Secret:** *[Paste your Google Gemini API Key here]*
7. Click **Add secret**.

### Triggering a Deployment

Once the secret is saved:
1. Push any change to the `main` branch.
2. Click the **Actions** tab in your repository to watch the build progress.
3. Once the workflow completes, your site will be live. You can find the URL in **Settings > Pages**.
