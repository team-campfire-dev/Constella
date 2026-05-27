import 'dotenv/config';
import { generateWikiContent } from '@/lib/gemini';

const topic = process.argv[2] ?? '우주';
const language = process.argv[3] ?? 'ko';

(async () => {
    const result = await generateWikiContent(topic, language);
    console.log('=== topic ===');
    console.log(result.topic);
    console.log('=== title ===');
    console.log(result.title);
    console.log('=== canonicalName ===');
    console.log(result.canonicalName);
    console.log('=== tags ===');
    console.log(result.tags);
    console.log('=== content ===');
    console.log(result.content);
    console.log('=== chatResponse ===');
    console.log(result.chatResponse);
    console.log('=== isFollowUp ===');
    console.log(result.isFollowUp);
})();
