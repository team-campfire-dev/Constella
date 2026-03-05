kill $(lsof -t -i :3000) 2>/dev/null || true
npm run dev > /dev/null 2>&1 &
sleep 5
npm run test:uat
