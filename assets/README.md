# Assets Directory

This directory contains visual assets for the Banana Browser README.

## Required Assets

### demo.gif

The main demo GIF showing `banana-browser demo` in action.

**Recording Instructions:**

1. Install asciinema and agg (or use ttygif):
   ```bash
   # macOS
   brew install asciinema
   cargo install --git https://github.com/asciinema/agg

   # Linux
   pip install asciinema
   cargo install --git https://github.com/asciinema/agg
   ```

2. Record the terminal session:
   ```bash
   asciinema rec demo.cast -c "npx banana-browser demo"
   ```

3. Convert to GIF:
   ```bash
   agg demo.cast demo.gif --cols 80 --rows 24
   ```

4. Optimize the GIF (optional):
   ```bash
   gifsicle -O3 demo.gif -o demo.gif
   ```

**Expected Content:**

The GIF should show:
- The `npx banana-browser demo` command running
- Chrome launching (or note that it's running headless)
- Bot detection tests being run
- Terminal output showing green checkmarks for passing tests
- Final summary with pass rate (should be 95%+ green)

**Recommended Settings:**

- Width: 600-800px
- Duration: 15-30 seconds
- Frame rate: 10-15 fps (for smaller file size)
- Max file size: 5MB (for GitHub rendering)

## Placeholder

Until the demo GIF is recorded, the README displays a placeholder message.
