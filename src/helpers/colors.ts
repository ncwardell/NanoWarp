/**
 * Terminal Color Utilities
 *
 * @module helpers/colors
 * @description Provides ANSI escape sequence utilities for colorizing terminal output.
 * Supports standard terminal colors and true color (24-bit RGB) for enhanced logging.
 */

/**
 * Available color options for terminal output
 */
export type TerminalColor =
    | 'red'
    | 'green'
    | 'yellow'
    | 'orange'
    | 'blue'
    | 'magenta'
    | 'cyan'
    | 'white'
    | 'reset';

/**
 * ANSI escape codes for terminal colors
 */
const ANSI_COLORS: Record<TerminalColor, string> = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    orange: '\x1b[38;2;255;165;0m', // True color (RGB)
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    reset: '\x1b[0m',
};

/**
 * ANSI reset code to clear all formatting
 */
const ANSI_RESET = '\x1b[0m';

/**
 * Wrap text with ANSI color codes for terminal output
 *
 * @param input - The text to colorize
 * @param color - The color to apply (defaults to 'reset' if invalid)
 * @returns The input string wrapped with ANSI color codes
 *
 * @example
 * ```typescript
 * console.log(setColor('Error occurred', 'red'));
 * console.log(setColor('Success!', 'green'));
 * console.log(setColor('Warning', 'yellow'));
 * ```
 */
export function setColor(input: string, color: string): string {
    const ansiCode = ANSI_COLORS[color as TerminalColor] || ANSI_COLORS.reset;
    return `${ansiCode}${input}${ANSI_RESET}`;
}