import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy as GitHubStrategy } from 'passport-github2';
import cors from 'cors';
import dotenv from 'dotenv';
import { Server } from 'socket.io';
import { Octokit } from '@octokit/rest';

// Define User interface
interface User {
  githubId: string;
  username: string;
  avatarUrl?: string;
  accessToken: string;
}

// In-memory user store (use database in production)
const userStore: Map<string, User> = new Map();

dotenv.config();

// Validate required environment variables
const requiredEnvVars = [
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'GITHUB_CALLBACK_URL',
  'SESSION_SECRET'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
  console.error('Please set these variables in your .env file or environment');
  process.exit(1);
}

// Log configuration (without sensitive data)
console.log('🚀 Starting server with configuration:');
console.log('  - Node Environment:', process.env.NODE_ENV || 'development');
console.log('  - Frontend URL:', process.env.FRONTEND_URL || 'http://localhost:3000');
console.log('  - Port:', process.env.PORT || 5000);
console.log('  - GitHub Callback:', process.env.GITHUB_CALLBACK_URL);

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Session middleware with in-memory store
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Enable secure cookies in production
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // Required for cross-site cookies
  },
});

// Middleware
app.use(cors({ 
  origin: FRONTEND_URL,
  credentials: true 
}));
app.use(express.json());
app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());

// Debug middleware to log session info
app.use((req, res, next) => {
  console.log('Session ID:', req.sessionID);
  console.log('User in session:', req.user ? (req.user as User).username : 'None');
  next();
});

// Passport GitHub Strategy
passport.use(
  new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      callbackURL: process.env.GITHUB_CALLBACK_URL!,
    },
    (accessToken: string, refreshToken: string, profile: any, done: any) => {
      const user: User = {
        githubId: profile.id,
        username: profile.username,
        avatarUrl: profile.photos?.[0]?.value,
        accessToken,
      };
      
      // Store user in memory
      userStore.set(profile.id, user);
      console.log('User stored:', { githubId: profile.id, username: profile.username, hasToken: !!accessToken });
      
      return done(null, user);
    }
  )
);

// Serialize user to store only the githubId in the session
passport.serializeUser((user: any, done) => {
  console.log('Serializing user:', (user as User).githubId);
  done(null, (user as User).githubId);
});

// Deserialize user from session ID, retrieve full user data from store
passport.deserializeUser((id: string, done) => {
  console.log('Deserializing user ID:', id);
  const user = userStore.get(id);
  if (user) {
    console.log('User deserialized successfully:', { githubId: id, username: user.username });
    done(null, user);
  } else {
    console.log('User not found in store:', id);
    done(new Error('User not found'), null);
  }
});

// Authentication check middleware
const requireAuth = (req: any, res: any, next: any) => {
  console.log('Auth check - User:', req.user ? (req.user as User).username : 'None');
  if (req.user) {
    next();
  } else {
    res.status(401).json({ 
      message: 'Not authenticated. Please login with GitHub first.',
      redirectUrl: '/auth/github'
    });
  }
};

// Code Analysis Function
function analyzeCode(code: string) {
  const lines = code.split('\n');
  const nonEmptyLines = lines.filter(line => line.trim().length > 0);
  const comments = lines.filter(line => line.trim().startsWith('//') || line.trim().startsWith('/*') || line.trim().startsWith('*'));
  
  // Detect programming language
  const language = detectLanguage(code);
  
  // Basic metrics
  const metrics = {
    linesOfCode: lines.length,
    nonEmptyLines: nonEmptyLines.length,
    comments: comments.length,
    commentRatio: comments.length / Math.max(nonEmptyLines.length, 1),
    averageLineLength: nonEmptyLines.reduce((sum, line) => sum + line.length, 0) / Math.max(nonEmptyLines.length, 1),
    language: language
  };

  // Code quality issues detection
  const issues = detectIssues(code, language);
  
  // Suggestions based on analysis
  const suggestions = generateSuggestions(code, metrics, issues);
  
  // Calculate overall score
  const score = calculateScore(metrics, issues);
  
  // Complexity analysis
  const complexity = analyzeComplexity(code, language);

  return {
    metrics,
    issues,
    suggestions,
    score,
    complexity,
    summary: generateSummary(metrics, issues, score)
  };
}

// Detect programming language based on code patterns
function detectLanguage(code: string): string {
  if (code.includes('function ') || code.includes('const ') || code.includes('let ') || code.includes('var ')) {
    if (code.includes('interface ') || code.includes(': string') || code.includes(': number')) {
      return 'TypeScript';
    }
    return 'JavaScript';
  }
  if (code.includes('def ') || code.includes('import ') && code.includes('from ')) {
    return 'Python';
  }
  if (code.includes('public class ') || code.includes('private ') || code.includes('System.out.')) {
    return 'Java';
  }
  if (code.includes('#include') || code.includes('int main(')) {
    return 'C/C++';
  }
  if (code.includes('using System') || code.includes('Console.WriteLine')) {
    return 'C#';
  }
  if (code.includes('<?php') || code.includes('echo ')) {
    return 'PHP';
  }
  return 'JavaScript'; // Default fallback
}

// Detect code quality issues
function detectIssues(code: string, language: string) {
  const issues = [];
  const lines = code.split('\n');

  // Check for common issues across languages
  lines.forEach((line, index) => {
    const lineNum = index + 1;
    const trimmed = line.trim();

    // Long lines
    if (line.length > 120) {
      issues.push({
        type: 'style',
        severity: 'warning',
        line: lineNum,
        message: 'Line too long (>120 characters)',
        suggestion: 'Consider breaking this line into multiple lines'
      });
    }

    // TODO comments
    if (trimmed.toLowerCase().includes('todo') || trimmed.toLowerCase().includes('fixme')) {
      issues.push({
        type: 'maintenance',
        severity: 'info',
        line: lineNum,
        message: 'TODO/FIXME comment found',
        suggestion: 'Consider addressing this technical debt'
      });
    }

    // Console logs in JavaScript/TypeScript
    if (language.includes('Script') && trimmed.includes('console.log')) {
      issues.push({
        type: 'debugging',
        severity: 'warning',
        line: lineNum,
        message: 'Console.log statement found',
        suggestion: 'Remove debug statements before production'
      });
    }

    // Missing semicolons in JavaScript/TypeScript
    if (language.includes('Script') && trimmed.length > 0 && !trimmed.endsWith(';') && 
        !trimmed.endsWith('{') && !trimmed.endsWith('}') && !trimmed.startsWith('//') &&
        !trimmed.includes('if ') && !trimmed.includes('else') && !trimmed.includes('for ') &&
        !trimmed.includes('while ') && !trimmed.includes('function ')) {
      issues.push({
        type: 'syntax',
        severity: 'info',
        line: lineNum,
        message: 'Missing semicolon',
        suggestion: 'Add semicolon at the end of the statement'
      });
    }

    // Deeply nested code
    const indentLevel = (line.match(/^\s*/)?.[0].length || 0) / 2;
    if (indentLevel > 4) {
      issues.push({
        type: 'complexity',
        severity: 'warning',
        line: lineNum,
        message: 'Deeply nested code detected',
        suggestion: 'Consider extracting this into a separate function'
      });
    }

    // Magic numbers
    const numbers = trimmed.match(/\b\d{2,}\b/g);
    if (numbers && !trimmed.includes('//')) {
      numbers.forEach(num => {
        if (parseInt(num) > 10 && !['100', '200', '404', '500'].includes(num)) {
          issues.push({
            type: 'maintainability',
            severity: 'info',
            line: lineNum,
            message: `Magic number detected: ${num}`,
            suggestion: 'Consider using a named constant'
          });
        }
      });
    }
  });

  // Language-specific issues
  if (language === 'JavaScript' || language === 'TypeScript') {
    // Check for == instead of ===
    if (code.includes(' == ') && !code.includes(' === ')) {
      const equalLines = lines.filter((line, index) => line.includes(' == ')).length;
      if (equalLines > 0) {
        issues.push({
          type: 'best-practice',
          severity: 'warning',
          line: lines.findIndex(line => line.includes(' == ')) + 1,
          message: 'Use === instead of == for strict equality',
          suggestion: 'Replace == with === for type-safe comparisons'
        });
      }
    }

    // Check for var usage
    if (code.includes('var ')) {
      issues.push({
        type: 'best-practice',
        severity: 'info',
        line: lines.findIndex(line => line.includes('var ')) + 1,
        message: 'Avoid using var, prefer let or const',
        suggestion: 'Use let for variables that change, const for constants'
      });
    }
  }

  return issues;
}

// Generate improvement suggestions
function generateSuggestions(code: string, metrics: any, issues: any[]) {
  const suggestions = [];

  // Comment ratio suggestions
  if (metrics.commentRatio < 0.1) {
    suggestions.push({
      type: 'documentation',
      priority: 'medium',
      message: 'Consider adding more comments to explain complex logic',
      impact: 'Improves code readability and maintainability'
    });
  }

  // Code length suggestions
  if (metrics.linesOfCode > 100) {
    suggestions.push({
      type: 'structure',
      priority: 'medium',
      message: 'Consider breaking this into smaller, more focused functions',
      impact: 'Improves code organization and testability'
    });
  }

  // Performance suggestions based on detected patterns
  if (code.includes('for (') && code.includes('.length')) {
    suggestions.push({
      type: 'performance',
      priority: 'low',
      message: 'Cache array length in loops to avoid repeated property access',
      impact: 'Minor performance improvement in tight loops'
    });
  }

  // Security suggestions
  if (code.includes('eval(') || code.includes('innerHTML')) {
    suggestions.push({
      type: 'security',
      priority: 'high',
      message: 'Avoid using eval() or innerHTML with user input',
      impact: 'Prevents potential XSS vulnerabilities'
    });
  }

  // Error handling suggestions
  if (!code.includes('try') && !code.includes('catch') && code.includes('async ')) {
    suggestions.push({
      type: 'error-handling',
      priority: 'medium',
      message: 'Add error handling for async operations',
      impact: 'Improves application reliability'
    });
  }

  return suggestions;
}

// Calculate overall code quality score
function calculateScore(metrics: any, issues: any[]): number {
  let score = 100;

  // Deduct points for issues
  issues.forEach(issue => {
    switch (issue.severity) {
      case 'error':
        score -= 10;
        break;
      case 'warning':
        score -= 5;
        break;
      case 'info':
        score -= 2;
        break;
    }
  });

  // Adjust for code metrics
  if (metrics.commentRatio < 0.05) score -= 10;
  if (metrics.commentRatio > 0.3) score += 5;
  if (metrics.averageLineLength > 100) score -= 5;

  return Math.max(0, Math.min(100, score));
}

// Analyze code complexity
function analyzeComplexity(code: string, language: string) {
  const lines = code.split('\n');
  let cyclomaticComplexity = 1; // Base complexity

  lines.forEach(line => {
    const trimmed = line.trim().toLowerCase();
    
    // Count decision points
    if (trimmed.includes('if ') || trimmed.includes('else if')) cyclomaticComplexity++;
    if (trimmed.includes('while ') || trimmed.includes('for ')) cyclomaticComplexity++;
    if (trimmed.includes('switch ') || trimmed.includes('case ')) cyclomaticComplexity++;
    if (trimmed.includes('catch ')) cyclomaticComplexity++;
    if (trimmed.includes('&&') || trimmed.includes('||')) {
      cyclomaticComplexity += (line.match(/&&|\|\|/g) || []).length;
    }
  });

  const functionCount = (code.match(/function\s+\w+|=>\s*{|def\s+\w+/g) || []).length;
  const maxNesting = Math.max(...lines.map(line => (line.match(/^\s*/)?.[0].length || 0) / 2));

  return {
    cyclomatic: cyclomaticComplexity,
    functions: functionCount,
    maxNesting: maxNesting,
    complexity: cyclomaticComplexity <= 10 ? 'Low' : cyclomaticComplexity <= 20 ? 'Medium' : 'High'
  };
}

// Generate analysis summary
function generateSummary(metrics: any, issues: any[], score: number) {
  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  const infoCount = issues.filter(i => i.severity === 'info').length;

  let quality = 'Excellent';
  if (score < 80) quality = 'Good';
  if (score < 60) quality = 'Fair';
  if (score < 40) quality = 'Poor';

  return {
    quality: quality,
    score: score,
    totalIssues: issues.length,
    breakdown: {
      errors: errorCount,
      warnings: warningCount,
      info: infoCount
    },
    recommendation: score >= 80 
      ? 'Code quality is excellent! Keep up the good work.' 
      : score >= 60 
      ? 'Good code quality with room for minor improvements.'
      : 'Consider addressing the identified issues to improve code quality.'
  };
}

// Routes
app.get('/auth/github', passport.authenticate('github', { scope: ['user:email', 'repo'] }));

app.get(
  '/auth/github/callback',
  passport.authenticate('github', { failureRedirect: `${FRONTEND_URL}/login` }),
  (req, res) => {
    console.log('GitHub callback successful, user:', req.user);
    res.redirect(`${FRONTEND_URL}/editor`);
  }
);

app.get('/api/user', (req, res) => {
  console.log('User info request - Session ID:', req.sessionID);
  console.log('User in request:', req.user);
  
  if (req.user) {
    const user = req.user as User;
    console.log('User info requested:', { githubId: user.githubId, hasToken: !!user.accessToken });
    res.json({
      githubId: user.githubId,
      username: user.username,
      avatarUrl: user.avatarUrl,
      isAuthenticated: true
    });
  } else {
    res.status(401).json({ 
      message: 'Not authenticated',
      isAuthenticated: false
    });
  }
});

app.get('/logout', (req, res, next) => {
  const userId = req.user ? (req.user as User).githubId : null;
  req.logout((err) => {
    if (err) return next(err);
    
    // Remove user from store on logout
    if (userId) {
      userStore.delete(userId);
      console.log('User removed from store:', userId);
    }
    
    // Destroy session
    req.session.destroy((err: any) => {
      if (err) {
        console.error('Session destroy error:', err);
      }
      res.redirect(FRONTEND_URL);
    });
  });
});

app.get('/', (req, res) => {
  res.send('CodeForge Backend Running');
});

// GitHub API Endpoints with authentication middleware

// List user repositories
app.get('/api/github/repos', requireAuth, async (req, res) => {
  console.log('Repository list requested');
  
  const user = req.user as User;
  console.log('Authenticated user for repo list:', { 
    githubId: user.githubId, 
    username: user.username, 
    hasAccessToken: !!user.accessToken 
  });

  if (!user.accessToken) {
    console.log('Authentication failed - user accessToken missing');
    return res.status(401).json({ message: 'Access token not available' });
  }

  try {
    const octokit = new Octokit({
      auth: user.accessToken,
    });
    
    // Get repositories for the authenticated user
    const { data: repos } = await octokit.repos.listForAuthenticatedUser({
      sort: 'updated',
      per_page: 100
    });
    
    // Map the response to include only needed fields
    const repoList = repos.map(repo => ({
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      description: repo.description,
      html_url: repo.html_url,
      default_branch: repo.default_branch,
      owner: {
        login: repo.owner.login,
        avatar_url: repo.owner.avatar_url
      }
    }));

    console.log(`Retrieved ${repoList.length} repositories for user`);
    res.json(repoList);
  } catch (error: any) {
    console.error('Error fetching repositories:', error.message);
    res.status(500).json({ 
      message: 'Failed to fetch repositories',
      error: error.message 
    });
  }
});

app.post('/api/github/push', requireAuth, async (req, res) => {
  console.log('Push request received:', req.body);

  const user = req.user as User;
  console.log('Authenticated user for push:', { 
    githubId: user.githubId, 
    username: user.username, 
    hasAccessToken: !!user.accessToken 
  });

  if (!user.accessToken) {
    console.log('Authentication failed - user accessToken missing');
    return res.status(401).json({ message: 'Access token not available' });
  }

  const { repo, filePath, content, branch } = req.body;
  
  // Validate required fields
  if (!repo || !filePath || content === undefined) {
    return res.status(400).json({ message: 'Missing required fields: repo, filePath, content' });
  }

  const patToken = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  const oauthToken = user.accessToken;
  
  console.log('PAT available:', patToken ? 'Yes' : 'No');
  console.log('OAuth token available:', oauthToken ? 'Yes' : 'No');
  
  const usedToken = patToken || oauthToken;
  console.log('Using token source:', patToken ? 'PAT' : 'OAuth');

  const octokit = new Octokit({
    auth: usedToken,
  });

  try {
    const [owner, repoName] = repo.split('/');
    
    if (!owner || !repoName) {
      return res.status(400).json({ message: 'Invalid repo format. Expected: owner/repo' });
    }

    console.log(`Attempting to push to ${owner}/${repoName}/${filePath}`);
    
    let sha: string | undefined;
    
    try {
      // Try to get existing file
      const { data } = await octokit.repos.getContent({
        owner,
        repo: repoName,
        path: filePath,
      });
      
      if ('sha' in data) {
        sha = data.sha;
        console.log('Existing file found, will update');
      }
    } catch (error) {
      console.log('File does not exist, will create new file');
    }

    // Create or update file
    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo: repoName,
      path: filePath,
      message: `Update ${filePath} from CodeForge`,
      content: Buffer.from(content).toString('base64'),
      branch: branch || 'main', // Use specified branch or default to main
      sha, // Include sha if updating existing file
      author: {
        name: user.username || 'CodeForge User',
        email: `${user.githubId}@users.noreply.github.com`,
      },
    });

    console.log('Successfully pushed to GitHub');
    res.json({ message: 'Code pushed to GitHub successfully' });
    
  } catch (error: any) {
    console.error('GitHub push error:', {
      message: error.message,
      status: error.status,
      response: error.response?.data
    });
    const errorDetails = error.response?.data?.message || error.message || 'Unknown error';
    res.status(500).json({
      message: 'Failed to push to GitHub',
      error: errorDetails,
      status: error.status
    });
  }
});

// Get repository contents (files and folders)
app.get('/api/github/contents/:owner/:repo', requireAuth, async (req, res) => {
  console.log('Repository contents request received');
  console.log('Request params:', { owner: req.params.owner, repo: req.params.repo });
  console.log('Query params:', req.query);
  
  const user = req.user as User;
  const { owner, repo } = req.params;
  const { path = '' } = req.query;

  console.log('User info:', { 
    githubId: user.githubId, 
    username: user.username, 
    hasAccessToken: !!user.accessToken 
  });

  if (!user.accessToken) {
    console.log('Authentication failed - user accessToken missing');
    return res.status(401).json({ message: 'Access token not available' });
  }

  try {
    const octokit = new Octokit({
      auth: user.accessToken,
    });

    console.log(`Fetching contents for ${owner}/${repo}${path ? `/${path}` : ''}`);
    
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path: path as string,
    });

    // Handle both single files and directory listings
    if (Array.isArray(data)) {
      // It's a directory - return the list of contents
      const contents = data.map(item => ({
        name: item.name,
        path: item.path,
        type: item.type, // 'file' or 'dir'
        size: item.size,
        sha: item.sha,
        download_url: item.download_url
      }));
      
      console.log(`Retrieved ${contents.length} items from directory`);
      res.json(contents);
    } else {
      // It's a single file - check if it has file-specific properties
      if ('content' in data && 'encoding' in data) {
        res.json({
          name: data.name,
          path: data.path,
          type: data.type,
          size: data.size,
          content: data.content || '',
          encoding: data.encoding || 'utf-8',
          sha: data.sha,
          download_url: data.download_url
        });
      } else {
        // Handle other file types (symlinks, etc.)
        res.json({
          name: data.name,
          path: data.path,
          type: data.type,
          size: data.size,
          content: '',
          encoding: 'utf-8',
          sha: data.sha,
          download_url: data.download_url || null
        });
      }
    }
  } catch (error: any) {
    console.error('Error fetching repository contents:', {
      message: error.message,
      status: error.status,
      response: error.response?.data,
      url: error.config?.url,
      owner,
      repo,
      path: path as string
    });
    res.status(error.status || 500).json({ 
      message: 'Failed to fetch repository contents',
      error: error.message,
      details: error.response?.data || 'No additional details available'
    });
  }
});

// Get file content from repository using query parameter instead of wildcard
app.get('/api/github/file/:owner/:repo', requireAuth, async (req, res) => {
  console.log('File content request received');
  
  const user = req.user as User;
  const { owner, repo } = req.params;
  const filePath = req.query.path as string; // Get file path from query parameter

  if (!user.accessToken) {
    console.log('Authentication failed - user accessToken missing');
    return res.status(401).json({ message: 'Access token not available' });
  }

  try {
    const octokit = new Octokit({
      auth: user.accessToken,
    });

    console.log(`Fetching file content for ${owner}/${repo}/${filePath}`);
    
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path: filePath,
    });

    // Ensure it's a file, not a directory
    if (Array.isArray(data)) {
      return res.status(400).json({ message: 'Path is a directory, not a file' });
    }

    if (data.type !== 'file') {
      return res.status(400).json({ message: 'Path is not a file' });
    }

    // Decode the content if it's base64 encoded
    let content = '';
    if (data.encoding === 'base64' && data.content) {
      content = Buffer.from(data.content, 'base64').toString('utf-8');
    }

    res.json({
      name: data.name,
      path: data.path,
      content: content,
      size: data.size,
      sha: data.sha
    });
  } catch (error: any) {
    console.error('Error fetching file content:', error.message);
    res.status(error.status || 500).json({ 
      message: 'Failed to fetch file content',
      error: error.message 
    });
  }
});

// AI-Powered Code Analysis Endpoint
app.post('/api/analyze', async (req, res) => {
  console.log('Code analysis request received');
  
  const { code } = req.body;
  
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ 
      message: 'Code content is required for analysis' 
    });
  }

  try {
    // Perform comprehensive code analysis
    const analysis = analyzeCode(code);
    
    console.log('Code analysis completed:', {
      linesOfCode: analysis.metrics.linesOfCode,
      issuesFound: analysis.issues.length,
      score: analysis.score
    });
    
    res.json({
      message: 'Code analysis completed successfully',
      analysis: analysis
    });
    
  } catch (error: any) {
    console.error('Code analysis error:', error.message);
    res.status(500).json({
      message: 'Code analysis failed',
      error: error.message
    });
  }
});

// Test endpoint to check GitHub API connectivity
app.get('/api/github/test', requireAuth, async (req, res) => {
  console.log('GitHub API test endpoint called');
  
  const user = req.user as User;
  
  try {
    const octokit = new Octokit({
      auth: user.accessToken,
    });

    // Test basic GitHub API access
    const { data: userInfo } = await octokit.users.getAuthenticated();
    
    res.json({
      message: 'GitHub API connection successful',
      user: {
        login: userInfo.login,
        name: userInfo.name,
        public_repos: userInfo.public_repos
      }
    });
  } catch (error: any) {
    console.error('GitHub API test failed:', {
      message: error.message,
      status: error.status,
      response: error.response?.data
    });
    
    res.status(500).json({
      message: 'GitHub API test failed',
      error: error.message,
      details: error.response?.data
    });
  }
});

// Create a new 'revit' branch in selected repository
app.post('/api/github/create-branch', requireAuth, async (req, res) => {
  console.log('Branch creation request received:', req.body);
  
  const user = req.user as User;
  console.log('Authenticated user for branch creation:', { 
    username: user.username, 
    hasAccessToken: !!user.accessToken 
  });

  if (!user.accessToken) {
    console.log('Authentication failed - user accessToken missing');
    return res.status(401).json({ message: 'Access token not available' });
  }

  const { repo } = req.body;
  
  // Validate required fields
  if (!repo) {
    return res.status(400).json({ message: 'Missing required field: repo' });
  }

  const octokit = new Octokit({
    auth: user.accessToken,
  });

  try {
    const [owner, repoName] = repo.split('/');
    
    if (!owner || !repoName) {
      return res.status(400).json({ message: 'Invalid repo format. Expected: owner/repo' });
    }

    console.log(`Creating 'revit' branch in ${owner}/${repoName}`);
    
    // Get the default branch reference
    const { data: repoData } = await octokit.repos.get({
      owner,
      repo: repoName
    });
    
    const defaultBranch = repoData.default_branch;
    console.log(`Default branch for ${repoName} is ${defaultBranch}`);
    
    // Get the SHA of the latest commit on the default branch
    const { data: refData } = await octokit.git.getRef({
      owner,
      repo: repoName,
      ref: `heads/${defaultBranch}`,
    });
    
    const sha = refData.object.sha;
    console.log(`Latest commit SHA: ${sha}`);
    
    try {
      // Check if the branch already exists
      await octokit.git.getRef({
        owner,
        repo: repoName,
        ref: 'heads/revit',
      });
      
      console.log('Branch "revit" already exists');
      return res.json({ 
        message: 'Branch "revit" already exists',
        branchName: 'revit',
        fullRepo: repo,
        defaultBranch
      });
    } catch (error) {
      // Branch doesn't exist, so create it
      await octokit.git.createRef({
        owner,
        repo: repoName,
        ref: 'refs/heads/revit',
        sha,
      });
      
      console.log('Successfully created "revit" branch');
      res.json({ 
        message: 'Branch "revit" created successfully', 
        branchName: 'revit',
        fullRepo: repo,
        defaultBranch
      });
    }
  } catch (error: any) {
    console.error('GitHub branch creation error:', {
      message: error.message,
      status: error.status,
      response: error.response?.data
    });
    const errorDetails = error.response?.data?.message || error.message || 'Unknown error';
    res.status(500).json({
      message: 'Failed to create branch',
      error: errorDetails,
      status: error.status
    });
  }
});

// Socket.io Setup
const server = require('http').createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Share session with Socket.IO
io.use((socket, next) => {
  sessionMiddleware(socket.request as any, {} as any, next as any);
});

// Authenticate Socket.IO connection
io.use((socket, next) => {
  const req = socket.request as any;
  console.log('Socket auth check - Session:', req.session?.passport?.user);
  
  if (req.session && req.session.passport && req.session.passport.user) {
    const user = userStore.get(req.session.passport.user);
    if (user) {
      socket.data.user = user;
      console.log('Socket authenticated for user:', user.username);
      return next();
    }
  }
  
  // Allow connection even if not authenticated
  console.log('Socket connection without authentication');
  next();
});

// Store active users in each room
const activeRooms = new Map<string, Map<string, any>>();

io.on('connection', (socket) => {
  const user = socket.data.user;
  const username = user ? user.username : `Guest_${socket.id.substring(0, 6)}`;
  const avatarUrl = user ? user.avatarUrl : undefined;
  
  console.log('✅ Socket connected:', username, 'ID:', socket.id);

  // Join a collaboration room (based on repository)
  socket.on('joinRoom', (data: { room: string }) => {
    const { room } = data;
    socket.join(room);
    
    // Initialize room if it doesn't exist
    if (!activeRooms.has(room)) {
      activeRooms.set(room, new Map());
    }
    
    // Add user to room
    const roomUsers = activeRooms.get(room)!;
    roomUsers.set(socket.id, {
      id: socket.id,
      username,
      avatarUrl,
      color: getRandomColor(),
      cursor: null
    });
    
    console.log(`👥 ${username} joined room: ${room}`);
    
    // Notify others in the room
    socket.to(room).emit('userJoined', {
      id: socket.id,
      username,
      avatarUrl,
      color: roomUsers.get(socket.id)?.color
    });
    
    // Send current users to the new user
    const users = Array.from(roomUsers.values());
    socket.emit('roomUsers', users);
    
    // Broadcast updated user list to all in room
    io.to(room).emit('roomUsers', users);
  });

  // Handle code changes in a specific room
  socket.on('codeChange', (data: { code: string; room: string; user?: string }) => {
    const { room, code } = data;
    console.log(`📝 Code change from ${username} in room: ${room}`);
    
    // Broadcast to others in the same room
    socket.to(room).emit('codeChange', {
      code,
      user: username,
      socketId: socket.id
    });
  });

  // Handle cursor position updates
  socket.on('cursorMove', (data: { room: string; position: any }) => {
    const { room, position } = data;
    
    // Update cursor in room
    const roomUsers = activeRooms.get(room);
    if (roomUsers && roomUsers.has(socket.id)) {
      const userInfo = roomUsers.get(socket.id);
      userInfo.cursor = position;
      roomUsers.set(socket.id, userInfo);
    }
    
    // Broadcast cursor position to others in room
    socket.to(room).emit('cursorMove', {
      socketId: socket.id,
      username,
      position,
      color: roomUsers?.get(socket.id)?.color
    });
  });

  // Handle selection updates
  socket.on('selectionChange', (data: { room: string; selection: any }) => {
    const { room, selection } = data;
    
    // Broadcast selection to others in room
    socket.to(room).emit('selectionChange', {
      socketId: socket.id,
      username,
      selection,
      color: activeRooms.get(room)?.get(socket.id)?.color
    });
  });

  // Handle typing indicator
  socket.on('typing', (data: { room: string; isTyping: boolean }) => {
    const { room, isTyping } = data;
    
    socket.to(room).emit('userTyping', {
      socketId: socket.id,
      username,
      isTyping
    });
  });

  // Leave room
  socket.on('leaveRoom', (data: { room: string }) => {
    const { room } = data;
    handleUserLeaveRoom(socket, room, username);
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('❌ Socket disconnected:', username);
    
    // Remove user from all rooms
    activeRooms.forEach((roomUsers, room) => {
      if (roomUsers.has(socket.id)) {
        handleUserLeaveRoom(socket, room, username);
      }
    });
  });
});

// Helper function to handle user leaving room
function handleUserLeaveRoom(socket: any, room: string, username: string) {
  const roomUsers = activeRooms.get(room);
  if (roomUsers) {
    roomUsers.delete(socket.id);
    console.log(`👋 ${username} left room: ${room}`);
    
    // Notify others in the room
    socket.to(room).emit('userLeft', {
      socketId: socket.id,
      username
    });
    
    // Update user list for room
    const users = Array.from(roomUsers.values());
    io.to(room).emit('roomUsers', users);
    
    // Clean up empty rooms
    if (roomUsers.size === 0) {
      activeRooms.delete(room);
      console.log(`🗑️ Room deleted: ${room} (empty)`);
    }
  }
  socket.leave(room);
}

// Helper function to generate random colors for users
function getRandomColor(): string {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
    '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#52B788'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT} with Socket.io`);
  console.log('Required environment variables:');
  console.log('- GITHUB_CLIENT_ID:', process.env.GITHUB_CLIENT_ID ? 'Set' : 'Missing');
  console.log('- GITHUB_CLIENT_SECRET:', process.env.GITHUB_CLIENT_SECRET ? 'Set' : 'Missing');
  console.log('- GITHUB_CALLBACK_URL:', process.env.GITHUB_CALLBACK_URL ? 'Set' : 'Missing');
  console.log('- SESSION_SECRET:', process.env.SESSION_SECRET ? 'Set' : 'Using default');
});