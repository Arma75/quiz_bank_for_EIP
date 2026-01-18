const QuizService = {
    async getQuizzes() {
        try {
            const response = await fetch("/api/quizzes");
            return await response.json();
        } catch (error) {
            console.error("데이터 로드 실패:", error);
            return [];
        }
    },

    async getCategories() {
        const res = await fetch("/api/categories");
        let json = await res.json();
        console.log(json.list);
        return json.list; //
    },

    async getRandomQuizzes(category, amount) {
        // 1. 우선 해당 카테고리의 전체 개수를 알기 위해 1개만 요청해봅니다.
        let baseUrl = `/api/quizzes/random?amount=${amount}`; // 넉넉하게 가져와서 섞음
        if (category !== 'ALL') baseUrl += `&categoryCd=${encodeURIComponent(category)}`;

        try {
            const res = await fetch(baseUrl);
            const data = await res.json();
            
            // 2. 서버에서 가져온 전체 목록(data.list)을 무작위로 섞고 사용자가 원하는 양만큼 자름
            return data.list.sort(() => Math.random() - 0.5);
        } catch (error) {
            console.error("데이터 로드 실패:", error);
            return [];
        }
    },

    async saveHistory(historyData) {
        try {
            await fetch("/api/quizHistories", {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(historyData)
            });
        } catch (error) {
            console.error("히스토리 저장 실패:", error);
        }
    },
    async getHistory(page = 1, size = 20) {
        try {
            // 최신순 정렬은 서버 쿼리(ORDER BY REG_DATE DESC)에 의존
            const url = `/api/quizHistories?page=${page}&size=${size}`;
            const response = await fetch(url);
            return await response.json();
        } catch (error) {
            console.error("히스토리 로드 실패:", error);
            return { list: [], totalCount: 0, totalPage: 0 };
        }
    },

    // 2. 오늘 틀린 문제만 가져오기 (데이터 최적화 버전)
    async getTodayWrongQuizzes() {
        const now = new Date();
        const startStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} 00:00:00`;
        const endStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} 23:59:59`;
        
        const url = `/api/quizHistories?regStart=${encodeURIComponent(startStr)}&regEnd=${encodeURIComponent(endStr)}`;
        const response = await fetch(url);
        const data = await response.json();

        // 랜덤으로 섞기
        data.list.sort(() => Math.random() - 0.5);
        
        // 1. 오답인 항목들만 필터링 (correctYn === 'N')
        const wrongItems = data.list.filter(item => item.correctYn === 'N');
        
        // 2. quizId를 기준으로 중복 제거 (같은 문제를 여러 번 틀렸을 경우 하나만 추출)
        const uniqueWrongQuizzes = [];
        const seenIds = new Set();

        for (const item of wrongItems) {
            if (!seenIds.has(item.quizId)) {
                seenIds.add(item.quizId);
                // item 자체가 이미 퀴즈 객체 구조이므로 그대로 넣되, 
                // 혹시 id가 히스토리 id(33, 32 등)로 되어있을 수 있으니 quizId를 id로 매핑해줍니다.
                uniqueWrongQuizzes.push({
                    ...item,
                    id: item.quizId // 퀴즈 풀기 로직은 'id' 필드를 기준으로 작동하므로 맞춰줌
                });
            }
        }

        return uniqueWrongQuizzes;
    }
};

const StatsService = {
    incrementTodayCount(isCorrect) { 
        const today = new Date().toLocaleDateString();
        let stats = JSON.parse(localStorage.getItem(today) || '{"total": 0, "correct": 0}');
        
        stats.total++;
        if (isCorrect) stats.correct++; // 이제 외부에서 전달받은 isCorrect를 사용함
        
        localStorage.setItem(today, JSON.stringify(stats));
        this.updateFlame();
    },

    async updateFlame() {
        const msgElement = document.getElementById('today-count-msg');
        const flameElement = document.getElementById('streak-flame');
        if (!msgElement && !flameElement) return;

        try {
            // 1. 오늘 날짜의 시작과 끝 시간 계산 (YYYY-MM-DD HH:mm:ss 형식)
            const now = new Date();
            const startStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} 00:00:00`;
            const endStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} 23:59:59`;

            // 2. API 호출 시 regStart, regEnd 파라미터 추가
            // Controller의 findAll 파라미터명과 매칭: regStart, regEnd
            const url = `/api/quizHistories?regStart=${encodeURIComponent(startStr)}&regEnd=${encodeURIComponent(endStr)}`;
            
            const response = await fetch(url);
            const data = await response.json();
            
            // 3. 서버에서 이미 필터링되어 오므로 바로 사용
            const total = data.totalCount || 0;
            const correct = data.list.filter(log => log.correctYn === 'Y').length;

            // 4. UI 업데이트
            if (msgElement) {
                msgElement.innerText = `오늘은 ${total}문제를 풀어 ${correct}문제를 맞혔습니다!`;
            }
            
            if (flameElement) {
                const size = Math.min(20 + (total * 5), 100); // 문제당 불꽃 커지는 정도 조절
                flameElement.style.width = size + 'px';
                flameElement.style.height = size + 'px';
                flameElement.style.opacity = total > 0 ? "1" : "0.3";
            }
        } catch (error) {
            console.error("통계 데이터 로드 실패:", error);
        }
    }
};