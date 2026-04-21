import { describe, it, expect } from 'vitest';
import { isSafeUrl } from './url';

describe('isSafeUrl', () => {
    it('allows safe protocols', () => {
        expect(isSafeUrl('http://example.com')).toBe(true);
        expect(isSafeUrl('https://example.com')).toBe(true);
        expect(isSafeUrl('mailto:test@example.com')).toBe(true);
        expect(isSafeUrl('tel:+1234567890')).toBe(true);
    });

    it('allows relative and absolute paths', () => {
        expect(isSafeUrl('/path/to/page')).toBe(true);
        expect(isSafeUrl('relative/path')).toBe(true);
        expect(isSafeUrl('#section')).toBe(true);
        expect(isSafeUrl('?query=123')).toBe(true);
    });

    it('blocks dangerous protocols', () => {
        expect(isSafeUrl('javascript:alert(1)')).toBe(false);
        expect(isSafeUrl('vbscript:msgbox("hello")')).toBe(false);
        expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    });

    it('blocks dangerous protocols with whitespace bypasses', () => {
        expect(isSafeUrl('java script:alert(1)')).toBe(false);
        expect(isSafeUrl('java\nscript:alert(1)')).toBe(false);
        expect(isSafeUrl('java\r\nscript:alert(1)')).toBe(false);
        expect(isSafeUrl(' j a v a s c r i p t :alert(1)')).toBe(false);
        expect(isSafeUrl('javascript :alert(1)')).toBe(false);
        expect(isSafeUrl('v b s c r i p t :msgbox("hello")')).toBe(false);
        expect(isSafeUrl('d a t a :text/html,...')).toBe(false);
    });

    it('handles empty and undefined inputs safely', () => {
        expect(isSafeUrl('')).toBe(true);
        expect(isSafeUrl(undefined)).toBe(true);
    });
});
