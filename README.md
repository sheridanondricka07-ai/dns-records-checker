# DNS Records Checker 🛡️

A high-performance, full-stack tool designed to bulk check SPF and MX records for multiple domains simultaneously. Built for speed, reliability, and modern aesthetics.

![DNS Records Checker](https://img.shields.io/badge/Status-Ready_to_Deploy-green)
![Vercel](https://img.shields.io/badge/Vercel-Serverless-black)
![Tailwind](https://img.shields.io/badge/Tailwind-CSS-blue)

## 🎯 Features

- **Bulk Processing**: Input hundreds of domains and check them all at once.
- **SPF Analysis**: Automatically extracts `v=spf1` records from TXT lookups.
- **MX Records**: Retrieves and sorts MX records by priority (hostnames only).
- **Vercel Optimized**: Built-in client-side chunking to handle large lists without hitting serverless timeouts.
- **Smart Handling**: Automatic deduplication, cleaning, and invalid domain filtering.
- **Premium UI**: Sleek dark mode with glassmorphism, progress tracking, and live stats.
- **Export Options**: Download results as CSV or copy directly to your clipboard.
- **Interactive Filtering**: Filter results by SPF presence, MX presence, or Errors.

## 📦 Tech Stack

- **Frontend**: HTML5, Tailwind CSS, Vanilla JavaScript (ES6+).
- **Backend**: Node.js (Vercel Serverless Functions).
- **DNS Library**: Native Node.js `dns/promises`.
- **Concurrency**: `p-limit` for controlled parallel lookups.

## 🚀 Getting Started

### Local Development

1. **Clone the repository**:
   ```bash
   git clone https://github.com/yourusername/dns-records-checker.git
   cd dns-records-checker
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run locally using Vercel CLI**:
   ```bash
   npm start
   ```
   *The app will be available at `http://localhost:3000`.*

### Deployment to Vercel

1. **Push to GitHub**: Create a new repository and push your code.
2. **Import to Vercel**: Connect your GitHub repository to Vercel.
3. **Deploy**: Vercel will automatically detect the configuration and deploy the app.

Alternatively, use the Vercel CLI:
```bash
vercel --prod
```

## 🔍 How it Works

1. **Input**: Enter domains (one per line) in the textarea.
2. **Batching**: The frontend splits your list into chunks of 25 domains.
3. **Processing**: Each chunk is sent to the backend where lookups are performed in parallel (concurrency limit of 15).
4. **Results**: Results are streamed back and displayed in real-time with response time metrics.

## 📊 Export Format

CSV exports include:
- `Domain`
- `SPF Record`
- `MX Records`
- `Status` (OK/Error)
- `Response Time (ms)`

---

Built with ❤️ by Antigravity.
