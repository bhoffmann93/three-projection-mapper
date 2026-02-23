# NPM Publish Checklist

## 🔴 Required Before Publishing

### 1. Update package.json Author Info
```json
"author": "YOUR_NAME <YOUR_EMAIL>"
```
Replace with your actual name and email.

### 2. Update Repository URLs
```json
"repository": {
  "type": "git",
  "url": "git+https://github.com/YOUR_USERNAME/three-projection-mapper.git"
},
"homepage": "https://github.com/YOUR_USERNAME/three-projection-mapper#readme",
"bugs": {
  "url": "https://github.com/YOUR_USERNAME/three-projection-mapper/issues"
}
```
Replace `YOUR_USERNAME` with your GitHub username.

### 3. Check Package Name Availability
```bash
npm search three-projection-mapper
```
If taken, consider scoped package: `@your-username/three-projection-mapper`

### 4. Create GitHub Repository
- Push code to GitHub first
- Make sure repository URLs in package.json match

---

## ✅ Already Complete

### Package Configuration
- ✅ Version: 0.0.1 (good starting point)
- ✅ Description: Detailed and accurate
- ✅ License: AGPL-3.0-or-later (with proper attribution)
- ✅ Main/Module/Types: Correctly configured
- ✅ Exports: Dual entry points (main + addons)
- ✅ Files: Only ships dist, LICENSE, README
- ✅ Keywords: Comprehensive for discoverability
- ✅ Scripts: prepublishOnly builds library automatically
- ✅ PeerDependencies: three.js properly declared
- ✅ Dependencies: Minimal (convex-hull, tweakpane)

### Documentation
- ✅ README.md: Complete with examples
- ✅ LICENSE: Full AGPL-3.0 with third-party attributions
- ✅ API Documentation: All exports documented
- ✅ Examples: Working single-window and multi-window setups

### Code Quality
- ✅ TypeScript: Strict mode, full type coverage
- ✅ Build: Library builds successfully (1.96s)
- ✅ Exports: All public API exported from lib.ts
- ✅ No redundant code: Refactored, DRY principles applied

---

## 📝 Publishing Steps

### 1. Final Verification
```bash
# Build the library
npm run build:lib

# Check what will be published
npm pack --dry-run

# Verify package contents
tar -tzf three-projection-mapper-*.tgz
```

### 2. Test Installation Locally
```bash
# In another project directory
npm install /path/to/three-projection-mapper

# Test imports
import { ProjectionMapper } from 'three-projection-mapper';
import { WindowSync } from 'three-projection-mapper/addons';
```

### 3. Login to npm
```bash
npm login
```

### 4. Publish
```bash
# First time publish
npm publish

# For scoped package (if name is taken)
npm publish --access public
```

---

## 🚀 Post-Publish

### 1. Create Git Tag
```bash
git tag v0.0.1
git push origin v0.0.1
```

### 2. Create GitHub Release
- Go to GitHub releases
- Create new release from v0.0.1 tag
- Copy relevant sections from README as release notes

### 3. Update README Badge (Optional)
Add npm version badge to README.md:
```markdown
[![npm version](https://badge.fury.io/js/three-projection-mapper.svg)](https://www.npmjs.com/package/three-projection-mapper)
```

---

## 🔄 Future Updates

When releasing updates:

1. Update version in package.json:
   ```bash
   npm version patch  # 0.0.1 -> 0.0.2
   npm version minor  # 0.0.1 -> 0.1.0
   npm version major  # 0.0.1 -> 1.0.0
   ```

2. Build and publish:
   ```bash
   npm publish
   ```

3. Create git tag and GitHub release

---

## ⚠️ Important Notes

### AGPL-3.0 License Implications
- Users who modify and distribute your library must also use AGPL-3.0
- Network use (web apps) counts as distribution under AGPL
- Make sure users understand the license terms

### Support Channels
After publishing, decide where users should:
- Report issues: GitHub Issues
- Ask questions: GitHub Discussions or Stack Overflow
- Contribute: CONTRIBUTING.md (optional)

---

## 📊 Package Size Check

Current build size:
- `dist/lib.js`: ~376 KB (105 KB gzipped)
- Total package: < 500 KB

This is reasonable for a WebGL library with GUI components.
