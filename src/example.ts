/**
 * Example usage of ProjectionMapper
 *
 * Single ContentManager class handles all scene content
 * Library focuses only on warping and window management
 */

import { ProjectionLibrary } from './ProjectionLibrary';
import { ProjectionMapperGUI, GUI_ANCHOR } from './ProjectionMapperGUI';
import { ContentManager } from './content/ContentManager';

// Create content using single ContentManager class
const content = new ContentManager();

// Create library (handles warping + windows)
const library = new ProjectionLibrary({
  resolution: { width: 1280, height: 800 },
  mode: 'controller',
});

library.start();

const mapper = library.getMapper();
const gui = new ProjectionMapperGUI(mapper, 'Projection Mapper', GUI_ANCHOR.LEFT);

// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
  if (e.key === 'g' || e.key === 'p') gui.toggle();
  if (e.key === 't') gui.toggleTestCard();
  if (e.key === 'h') gui.toggleWarpUI();
});

// Handle resize
window.addEventListener('resize', () => {
  const width = window.innerWidth;
  const height = window.innerHeight;

  library.getRenderer().setSize(width, height);
  content.resize();
  mapper.resize(width, height);
});

// Animation loop
function animate() {
  requestAnimationFrame(animate);

  // Update content
  content.update();

  // Render via library
  library.render((renderer, renderTarget) => {
    content.render(renderer, renderTarget);
  });
}

animate();

console.log('ProjectionMapper Example');
console.log('Controls:');
console.log('  G/P - Toggle GUI');
console.log('  T - Toggle testcard');
console.log('  H - Hide all controls');
console.log('  Drag corners/grid points to adjust projection');
