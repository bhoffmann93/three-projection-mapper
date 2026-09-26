# Design Principles

Adapted from web-mapper's CLAUDE.md. This keeps only the rules that fit a library,
and names this repo's own files where the original named web-mapper's.

## Design

- **Minimize complexity**: The primary goal of software design is to minimize complexity, meaning anything that makes a system hard to understand and modify.
- **Information hiding**: Each module encapsulates design decisions other modules don't need to know about. This includes third-party internals: code that relies on a library's internal class names or structure (Tweakpane DOM, three.js private fields) lives in one adapter module, never inlined in feature code.
- **Pull complexity downward**: A module may be complex inside if that keeps its interface simple. The public API (`ProjectionMapper`, `WarpSurface`, `MeshWarper`) should ask callers for as little as possible.
- **Favor exceptions over wrong results**: Throw for unknown edge cases rather than guessing. For example, `SurfaceMask.setPolygonNodes` throws past `MAX_POLYGON_POINTS` instead of silently truncating.
- **DRY**: Keep shared behaviour in one place so there is a single source of truth.
- **Reuse the existing vocabulary**: Before adding an enum, option set or family of settings, look for one that already says the same thing. Existing vocabularies here include `WARP_MODE`, `HANDLE_GROUP`, `RenderOrder`, the `*_SETTINGS` and `*_STYLE` objects in `src/core/defaults.ts`, and the IPC event types in `src/ipc/EventTypes.ts`. Where one does not fit, say what is missing rather than starting a parallel set.
- **A control's label is vocabulary too**: A word the codebase already uses for one thing must not get a second meaning in the GUI. "Warp point" is a corner or grid control point, and "surface" is one warped mesh. Name a control by what it does to the picture, not by what the shader multiplies.
- **A number the code can derive is not a control**: Before adding a slider or config option, ask what its right value is. If the library already knows it (a plane size from a resolution, a grid size from an aspect ratio), derive it. A hardware budget belongs in a constant such as `MAX_POLYGON_POINTS`, not in a control.
- **Find the shared implementation before writing one**: Check `src/utils/` (perspective, geometry), `src/core/` and the shaders before writing a helper. A shared piece written for a slightly different frame is still the thing to reuse.
- **SRP**: A module, class or function has one clearly defined responsibility and one reason to change.
- **Decoupled architecture**: Favor composition over inheritance, as `WarpSurface` composes `MeshWarper`, `SurfaceMask` and `PolygonMask`.

## Naming and types

- **Self-documenting intent**: Use precise names and don't abbreviate them (`attributes`, not `attr`). Don't use magic numbers. Where a fully explicit name gets unwieldy, a shorter name with a one-line comment beats the long name.
- **Explicit dependencies over ambient reads**: A function that needs a value takes it as a parameter. That includes GLSL: pass the uv or position in rather than reading a varying or uniform from deep inside a helper. Never derive the same value twice in one pass. Compute it once where it is owned and pass it down.
- **Strict type safety**: Use strict null checks, explicit interfaces and return types, and no magic strings.
- **No underscore prefix** on functions, fields, or similar.
- **Robust event systems**: Event payloads, state keys and communication interfaces use constants and mapped types (see `src/ipc/`).
- **`satisfies` over explicit annotation** on registries and maps, so literal key types are kept:
  ```ts
  // correct: keys preserved as literals
  export const registry = { ... } satisfies Record<string, Def>;
  // wrong: keys widened to string
  export const registry: Record<string, Def> = { ... };
  ```
- **Prefer arrow function syntax** for util functions.
- **No emoji** in code.
- **Never write a colour as hex.** Use `THREE.Color` with a CSS name (sRGB, converted by the library) or named `Color(r, g, b)` components. In GLSL a colour arrives as a `vec3` uniform or a named constant, never as an anonymous literal.

## Constants and storage

- **One owner per constant**: Library defaults, styles and limits live in `src/core/defaults.ts`. Never define a shared value locally in a consumer file. If a second file needs it, centralise it first.
- **Group related constants into a `const` object** instead of flat exports with a shared prefix:
  ```ts
  // correct
  export const POLYGON_HANDLE_STYLE = { color: ..., anchorPointPixelRadius: 6 } as const;
  // wrong
  export const POLYGON_HANDLE_COLOR = ...;
  export const POLYGON_HANDLE_RADIUS = 6;
  ```
- **Storage keys and stored-format tags are constants**, never inline strings.
- **Changing a stored key or format discards what users calibrated.** A projection calibration is expensive to redo. Either migrate the old format on load, as `PolygonMask.migrateFromCornerSpace` does, or bump `STORAGE_VERSION` and say plainly in the PR that saved state is dropped.

## Comments

- **Default to none**: Naming and structure carry the intent. Write a comment only for what the code cannot show: a GPU or library behaviour, a constraint from outside the file, or why a non-obvious choice beat the obvious one. Never restate the line. Keep it to two lines at most, with no ASCII banners.
- **Module headers**: One short block on a class or module saying what it is and why it exists, four lines at most. Contract files that others implement against may carry a longer header documenting how to implement them.
- **Group a long file by stage**: Order functions by pipeline stage, and by dataflow within a stage. Mark a stage with a plain one-line comment, never a rule of dashes.
- **Comment punctuation**: No semicolons, em dashes or en dashes in comments or user-facing strings such as error messages. Use two sentences or a comma instead.

## Shaders

- **A build that passes is not a shader that compiles.** Vite bundles GLSL as a string, so a broken shader builds clean and fails in the browser. Check that every uniform is declared, every function is defined above its call site, and no name collides with three.js `ShaderChunk` names (functions and uniforms alike). Then load it in a browser.
- **A setting at zero must not pay for the work it cancels.** Skip a mask, blur or loop whose amount is zero rather than evaluating it and discarding the result, and leave its variable at the neutral value.
- **Declare every uniform where the material is built.** `ShaderMaterial` reads its uniform set at compile time, so a key added to the object later never reaches the shader. Masks merge their uniforms into `WarpMaterial` at construction for this reason.
- **A struct ternary fails in the browser.** `S v = flag ? a : b;` bundles fine and fails at compile. Branch with `if` or assign field by field.

## Multi-window

- **Every feature that affects visual output must also work in a projector window.** For any change to warp, masks, surfaces or image settings, ask whether `WindowSync` must broadcast it, and whether the projector must restore it from storage on boot.
