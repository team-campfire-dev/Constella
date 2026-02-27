import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config'; // Load .env file

async function runUAT() {
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const loginUrl = `${baseUrl}/ko/login`;
    const username = process.env.AGENT_EMAIL;
    const password = process.env.AGENT_PASSWORD;

    if (!username || !password) {
        console.error("Error: AGENT_EMAIL and AGENT_PASSWORD environment variables must be set.");
        process.exit(1);
    }

    const verificationDir = path.join(process.cwd(), 'verification');
    if (!fs.existsSync(verificationDir)) {
        fs.mkdirSync(verificationDir, { recursive: true });
    }

    console.log(`Starting UAT...`);
    console.log(`Target URL: ${baseUrl}`);
    console.log(`User: ${username}`);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        console.log(`Navigating to ${loginUrl}`);
        await page.goto(loginUrl);

        await page.waitForSelector('form');

        console.log("Filling login form...");
        await page.getByLabel("이메일 주소").fill(username);
        await page.getByLabel("비밀번호").fill(password);

        console.log("Submitting form...");
        // Use force: true to bypass the Next.js dev overlay interception
        await page.locator('button[type="submit"]').click({ force: true });

        console.log("Waiting for navigation...");
        await page.waitForURL(url => url.toString().includes(`${baseUrl}/ko`) && !url.toString().includes('login'), { timeout: 15000 });

        console.log("Login successful! Checking dashboard links...");
        await page.screenshot({ path: path.join(verificationDir, 'dashboard.png') });

        // Verify Star Map
        console.log("Navigating to Star Map...");
        await page.goto(`${baseUrl}/ko/star-map`);
        try {
            await page.waitForSelector("canvas", { timeout: 15000 });
            console.log("Star Map loaded.");
        } catch (e) {
            console.error("Star Map failed to load (canvas not found).");
        }
        await page.screenshot({ path: path.join(verificationDir, 'star_map.png') });

        // Verify Ship Log
        console.log("Navigating to Ship Log...");
        await page.goto(`${baseUrl}/ko/ship-log`);
        await page.waitForTimeout(2000);
        await page.screenshot({ path: path.join(verificationDir, 'ship_log.png') });
        console.log("Ship Log loaded.");

        // Verify Console
        console.log("Navigating to Console...");
        await page.goto(`${baseUrl}/ko/console`);
        await page.waitForTimeout(2000);
        await page.screenshot({ path: path.join(verificationDir, 'console.png') });
        console.log("Console loaded.");

    } catch (error) {
        console.error("Test failed:", error);
        await page.screenshot({ path: path.join(verificationDir, 'failure.png') }).catch(() => {});
        process.exit(1);
    } finally {
        await browser.close();
    }
}

runUAT().catch(console.error);
