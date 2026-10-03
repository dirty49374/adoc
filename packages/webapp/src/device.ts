/** Whether this device takes touch, such as an iPad: the one place the web UI tells a touch device. */
export const TOUCH = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
