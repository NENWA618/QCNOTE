# QCNOTE

A modern, privacy-first personal note-taking application built with Next.js, featuring offline-first architecture, powerful search, and beautiful UI.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-15.0-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)

## ✨ Features

- **📝 Offline-First**: Works without internet connection, data stored locally
- **🔍 Powerful Search**: Full-text search with fuzzy matching and semantic search
- **🎨 Beautiful UI**: Modern design with dark mode and responsive layout
- **🔒 Privacy-Focused**: Your data stays on your device
- **📊 Knowledge Graph**: Visualize connections between your notes
- **☁️ Sync Options**: WebDAV, OneDrive integration for cross-device sync
- **🤖 AI Integration**: Sentiment analysis and smart suggestions
- **📱 Cross-Platform**: Works on desktop, tablet, and mobile

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/NENWA618/QCNOTE.git
cd QCNOTE
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

### Docker

```bash
docker-compose up -d
```

## 📖 Usage

### Creating Notes

1. Click "New Note" or press `Ctrl+N`
2. Write in Markdown format
3. Add tags for organization
4. Notes are automatically saved

### Search & Organization

- Use the search bar for instant full-text search
- Filter by tags, categories, or date ranges
- View knowledge graph to understand note relationships

### Sync & Backup

- Configure WebDAV or OneDrive sync in settings
- Automatic conflict resolution
- Version history for note recovery

## 🏗️ Architecture

QCNOTE follows a modern web architecture:

- **Frontend**: Next.js 15 with React 18, TypeScript
- **Styling**: Tailwind CSS with custom design system
- **Storage**: IndexedDB for local storage, optional cloud sync
- **Search**: Lunr.js for full-text search, custom vector search
- **State**: React Context with optimized re-renders
- **Build**: Vercel-ready with optimized bundles

For detailed architecture information, see [ARCHITECTURE.md](docs/ARCHITECTURE.md).

## 🧪 Development

### Available Scripts

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run start    # Start production server
npm run lint     # Run ESLint
npm run ci       # Run lint, type check, tests, and build
npm test         # Run tests
```

### Project Structure

```
QCNOTE/
├── components/          # React components
├── lib/                # Utility functions and business logic
├── pages/              # Next.js pages (App Router)
├── public/             # Static assets
├── styles/             # Global styles and Tailwind config
├── docs/               # Documentation
└── server/             # Backend API (if applicable)
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and add tests
4. Run the test suite: `npm test`
5. Commit your changes: `git commit -m 'Add amazing feature'`
6. Push to the branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- Styled with [Tailwind CSS](https://tailwindcss.com/)
- Search powered by [Lunr.js](https://lunrjs.com/)
- Icons from various open source projects

## 📞 Support

- 📧 Email: sylvestertian@gmail.com
- 🐛 Issues: [GitHub Issues](https://github.com/NENWA618/QCNOTE/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/NENWA618/QCNOTE/discussions)