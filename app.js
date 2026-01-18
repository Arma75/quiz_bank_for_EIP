const router = {
    screens: {
        'main': document.getElementById('main-screen'),
        'quiz': document.getElementById('quiz-screen'),
        'history': document.getElementById('history-screen')
    },
    navigate(screenName) {
        Object.values(this.screens).forEach(s => s.style.display = 'none');
        this.screens[screenName].style.display = 'block';

        // 핵심: 퀴즈 화면 진입 시 정확히 QuizUI의 초기화 로직 실행
        if (screenName === 'quiz') {
            QuizUI.init(); 
        }
        if (screenName === 'main') {
            if (window.StatsService) StatsService.updateFlame();
        }
        if (screenName === 'history') {
            HistoryUI.init();
        }
    }
};