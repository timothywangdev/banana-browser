/**
 * Query Command Handlers
 * screenshot, snapshot, evaluate commands
 */

import { registerCommand } from '../index.js';
import { requireSession, generateRef, resetRefs } from '../browser.js';
import {
  ScreenshotParams,
  SnapshotParams,
  EvaluateParams,
  ScreenshotResult,
  SnapshotResult,
  EvaluateResult,
  ElementRef,
  ErrorCodes,
} from '../types.js';

// Screenshot command
registerCommand('screenshot', async (params: unknown): Promise<ScreenshotResult> => {
  const p = params as ScreenshotParams;
  const session = requireSession();

  const options: Parameters<typeof session.page.screenshot>[0] = {
    fullPage: p.fullPage ?? false,
    type: p.format ?? 'png',
  };

  if (p.path) {
    options.path = p.path;
    await session.page.screenshot(options);
    return { path: p.path };
  } else {
    const buffer = await session.page.screenshot(options);
    return { base64: buffer.toString('base64') };
  }
});

// Accessibility node type from page.evaluate
interface AccessibilityNode {
  role: string;
  name: string;
  children?: AccessibilityNode[];
}

// Snapshot command - accessibility tree with element refs
registerCommand('snapshot', async (params: unknown): Promise<SnapshotResult> => {
  const p = params as SnapshotParams;
  const session = requireSession();

  // Reset refs for new snapshot
  resetRefs();

  // Get accessibility tree via page.evaluate using DOM traversal
  const snapshot = await session.page.evaluate((interestingOnly: boolean) => {
    const interestingRoles = new Set([
      'button', 'link', 'textbox', 'checkbox', 'radio', 'combobox',
      'listbox', 'option', 'menuitem', 'tab', 'tabpanel', 'heading',
      'img', 'navigation', 'main', 'banner', 'contentinfo', 'search',
      'form', 'dialog', 'alertdialog', 'alert', 'status', 'table',
      'row', 'cell', 'columnheader', 'rowheader', 'list', 'listitem'
    ]);

    function getRole(el: Element): string {
      // Explicit ARIA role takes precedence
      const ariaRole = el.getAttribute('role');
      if (ariaRole) return ariaRole;

      // Map HTML elements to implicit roles
      const tagName = el.tagName.toLowerCase();
      const roleMap: Record<string, string> = {
        'a': el.hasAttribute('href') ? 'link' : 'generic',
        'button': 'button',
        'input': getInputRole(el as HTMLInputElement),
        'select': 'combobox',
        'textarea': 'textbox',
        'h1': 'heading', 'h2': 'heading', 'h3': 'heading',
        'h4': 'heading', 'h5': 'heading', 'h6': 'heading',
        'img': 'img',
        'nav': 'navigation',
        'main': 'main',
        'header': 'banner',
        'footer': 'contentinfo',
        'form': 'form',
        'table': 'table',
        'tr': 'row',
        'td': 'cell',
        'th': 'columnheader',
        'ul': 'list', 'ol': 'list',
        'li': 'listitem',
        'dialog': 'dialog',
      };
      return roleMap[tagName] || 'generic';
    }

    function getInputRole(input: HTMLInputElement): string {
      const type = input.type.toLowerCase();
      const inputRoleMap: Record<string, string> = {
        'button': 'button', 'submit': 'button', 'reset': 'button',
        'checkbox': 'checkbox', 'radio': 'radio',
        'text': 'textbox', 'email': 'textbox', 'password': 'textbox',
        'search': 'searchbox', 'tel': 'textbox', 'url': 'textbox',
      };
      return inputRoleMap[type] || 'textbox';
    }

    function getName(el: Element): string {
      // aria-label takes precedence
      const ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel) return ariaLabel;

      // aria-labelledby
      const labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        const labelEl = document.getElementById(labelledBy);
        if (labelEl) return labelEl.textContent?.trim() || '';
      }

      // For inputs, check associated label
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
        const id = el.id;
        if (id) {
          const label = document.querySelector(`label[for="${id}"]`);
          if (label) return label.textContent?.trim() || '';
        }
      }

      // Use alt for images
      if (el instanceof HTMLImageElement) {
        return el.alt || '';
      }

      // Use text content for simple elements
      const text = el.textContent?.trim() || '';
      return text.length <= 100 ? text : text.substring(0, 100) + '...';
    }

    function isVisible(el: Element): boolean {
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    }

    function buildTree(el: Element): AccessibilityNode | null {
      if (!isVisible(el)) return null;

      const role = getRole(el);
      const name = getName(el);

      // Skip generic elements with no name in interesting-only mode
      if (interestingOnly && role === 'generic' && !name) {
        // But still process children
        const children: AccessibilityNode[] = [];
        for (const child of el.children) {
          const childNode = buildTree(child);
          if (childNode) children.push(childNode);
        }
        // If we have interesting children, return a container
        if (children.length > 0) {
          return children.length === 1 ? children[0] : { role: 'group', name: '', children };
        }
        return null;
      }

      const node: AccessibilityNode = { role, name };

      // Process children
      const children: AccessibilityNode[] = [];
      for (const child of el.children) {
        const childNode = buildTree(child);
        if (childNode) children.push(childNode);
      }
      if (children.length > 0) {
        node.children = children;
      }

      return node;
    }

    return buildTree(document.body);
  }, p.interestingOnly ?? true) as AccessibilityNode | null;

  const refs: Record<string, ElementRef> = {};
  const lines: string[] = [];

  // Recursively process accessibility tree
  function processNode(node: AccessibilityNode, depth: number = 0): void {
    const indent = '  '.repeat(depth);
    const ref = generateRef();

    // Store ref mapping
    refs[ref] = {
      role: node.role || 'generic',
      name: node.name || '',
    };

    // Create locator for this element using role and name
    if (node.role && node.role !== 'generic' && node.name) {
      try {
        const locator = session.page.getByRole(node.role as Parameters<typeof session.page.getByRole>[0], {
          name: node.name,
          exact: false,
        });
        session.elementRefs.set(ref, locator);
      } catch {
        // Role may not be supported by getByRole, skip locator creation
      }
    }

    // Format line
    let line = `${indent}- ${node.role || 'element'}`;
    if (node.name) {
      line += ` "${node.name}"`;
    }
    line += ` [ref=${ref}]`;
    lines.push(line);

    // Process children
    if (node.children) {
      for (const child of node.children) {
        processNode(child, depth + 1);
      }
    }
  }

  if (snapshot) {
    processNode(snapshot);
  }

  return {
    tree: lines.join('\n'),
    refs,
  };
});

// Evaluate command - execute JavaScript in page context
registerCommand('evaluate', async (params: unknown): Promise<EvaluateResult> => {
  const p = params as EvaluateParams;

  if (!p.expression) {
    throw { code: ErrorCodes.INVALID_PARAMS, message: 'Missing required parameter: expression' };
  }

  const session = requireSession();

  try {
    // Use Function constructor to evaluate expression
    const result = await session.page.evaluate((expr: string) => {
      return eval(expr);
    }, p.expression);

    return { result };
  } catch (error) {
    throw {
      code: ErrorCodes.INTERNAL_ERROR,
      message: `Evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
});
