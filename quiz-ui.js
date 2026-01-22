const escapeHTML = (str) => {
    if (!str) return "";
    return str.replace(/[&<>"']/g, (m) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[m]));
};

const QuizUI = {
    currentQuizData: null,
    currentIndex: 0,
    isAnswering: false, // 중복 클릭 방지
    isReadOnly: false, // 기록 여부 플래그 추가
    selectedOption: null,

    async init() {
        const content = document.getElementById('quiz-content');
        
        // 1. [핵심] 서버 응답을 기다리지 않고 즉시 메모리 비우기 및 기본 레이아웃 렌더링
        this.currentQuizData = null;
        this.currentIndex = 0;

        const saved = localStorage.getItem('quiz_state');
        if (saved) {
            try {
                const state = JSON.parse(saved);
                if (state.data && state.data.length > 0) {
                    this.currentQuizData = state.data;
                    this.currentIndex = state.index;
                    this.renderProblem(); // 이어 풀기라면 즉시 문제 화면으로
                    return;
                }
            } catch (e) {
                localStorage.removeItem('quiz_state');
            }
        }
        
        // 2. 이어 풀기가 아니면 즉시 "설정 화면 껍데기"부터 그립니다.
        this.renderSetupSkeleton();

        // 3. 화면이 나온 상태에서 배경에서 카테고리를 가져옵니다.
        try {
            const categories = await QuizService.getCategories();
            this.updateCategoryOptions(categories);
        } catch (e) {
            console.error("카테고리 로드 실패", e);
        }
    },

    // 설정 화면의 기본 뼈대를 먼저 그리는 함수
    renderSetupSkeleton() {
        const content = document.getElementById('quiz-content');
        content.innerHTML = `
            <div class="quiz-setup-card">
                <h3>학습 설정</h3>
                <label>카테고리 선택</label>
                <select id="category-select" disabled>
                    <option>카테고리를 불러오는 중...</option>
                </select>

                <label>문제 개수 (1~500)</label>
                <input type="number" id="quiz-amount" value="5" min="1" max="500">

                <button id="btn-quiz-start" class="btn-start" disabled onclick="QuizUI.startNewQuiz()">
                    불러오는 중...
                </button>
            </div>
        `;
    },

    // 데이터 로드가 완료되면 콤보박스와 버튼을 활성화하는 함수
    updateCategoryOptions(categories) {
        const select = document.getElementById('category-select');
        const btn = document.getElementById('btn-quiz-start');
        const amountInput = document.getElementById('quiz-amount');
        
        if (!select || !btn) return;

        let options = '<option value="ALL">전체</option>';
        options += categories.map(c => `<option value="${c.categoryCd}">${c.categoryNm}</option>`).join('');
        
        select.innerHTML = options;
        select.disabled = false; // 선택창 활성화
        btn.innerText = "문제 풀기 시작";
        btn.disabled = false; // 버튼 활성화
        
        select.addEventListener('change', (e) => {
            if (e.target.value !== 'ALL') {
                if (amountInput) {
                    amountInput.value = 500;
                }
            } else {
                if (amountInput) {
                    amountInput.value = 5;
                }
            }
        });
    },

    renderSetup(categories) {
        const content = document.getElementById('quiz-content');
        // 설정 화면을 그릴 때도 확실하게 덮어씌웁니다.
        content.innerHTML = `
            <div class="quiz-setup-card">
                <h3>학습 설정</h3>
                <label>카테고리 선택</label>
                <select id="category-select">
                    <option value="ALL">전체</option>
                    ${categories.map(c => `<option value="${c}">${c}</option>`).join('')}
                </select>

                <label>문제 개수 (1~100)</label>
                <input type="number" id="quiz-amount" value="5" min="1" max="100">

                <button class="btn-start" onclick="QuizUI.startNewQuiz()">문제 풀기 시작</button>
            </div>
        `;
    },

    async startNewQuiz() {
        const category = document.getElementById('category-select').value;
        const amount = parseInt(document.getElementById('quiz-amount').value);
        
        const problems = await QuizService.getRandomQuizzes(category, amount);
        
        // 데이터가 정상적으로 넘어왔는지 확인
        if (!problems || problems.length === 0) {
            alert("해당 카테고리에 문제가 없습니다.");
            return;
        }

        this.isReadOnly = false;

        this.currentQuizData = problems;
        this.currentIndex = 0;
        this.saveState();
        this.renderProblem();
    },

    // quiz-ui.js 내의 renderProblem 수정 예시
    renderProblem() {
        this.isAnswering = false;
        this.selectedOption = null; // 문제 렌더링 시 선택 초기화
        const problem = this.currentQuizData[this.currentIndex];
        const content = document.getElementById('quiz-content');

        // 1. 보기 데이터 구조화 (원래 번호 유지)
        let options = [
            { num: 1, text: problem.option1 },
            { num: 2, text: problem.option2 },
            { num: 3, text: problem.option3 },
            { num: 4, text: problem.option4 }
        ];

        // 2. randomYn이 'Y'이면 보기 셔플
        console.log(problem);
        console.log(options);
        if (problem.randomYn === 'Y') {
            options.sort(() => Math.random() - 0.5);
        }
        console.log(options);
        let answer = options.filter((o, i) => o.num == problem.answer)[0];
        let answerIndex = 0;
        for (; answerIndex < 4; answerIndex++) {
            if (options[answerIndex].num == problem.answer) {
                break;
            }
        }
        // [수정] \n 또는 \\n 문자열을 실제 줄바꿈 기호로 변환 (문제 텍스트)
        const formattedQuestion = problem.question.replace(/\\n/g, '\n').replace(/\n/g, '\n');
        
        // 해설 텍스트 추출 (null 체크 포함)
        const rawExplanation = problem.explanation || '해설이 없습니다.';
        
        // \n 문자열이든 실제 개행이든 모두 <br> 태그로 변환
        const formattedExplanation = rawExplanation.replace(/(\r\n|\n|\\n)/g, '<br>');

        content.innerHTML = `
            <div class="quiz-container">
                <div class="progress">${this.currentIndex + 1} / ${this.currentQuizData.length}</div>
                <h3 class="question">${escapeHTML(formattedQuestion)}</h3>
                <div class="options-grid">
                    ${options.map((opt, idx) => `
                        <button class="option-btn" id="opt-${opt.num}" onclick="QuizUI.selectOption(${opt.num})">
                            ${escapeHTML(opt.text)}
                        </button>
                    `).join('')}
                </div>
                <button id="btn-check-answer" class="btn-start" style="margin-top: 20px;" onclick="QuizUI.submitAnswer(${answerIndex})">
                    정답 확인
                </button>
                <div id="explanation-box" style="display:none;" class="explanation">
                    <p><strong>정답: ${escapeHTML(answer.text)}</strong></p>
                    <p>${formattedExplanation}</p>
                    <button class="btn-next" onclick="QuizUI.nextStep()">다음 문제</button>
                </div>
            </div>
        `;
    },

    // 보기를 클릭했을 때 실행 (선택 상태 표시)
    selectOption(num) {
        if (this.isAnswering) return; // 이미 정답 확인 후면 무시

        this.selectedOption = num;
        
        // UI 처리: 모든 버튼에서 selected 클래스 제거 후 클릭한 것만 추가
        document.querySelectorAll('.option-btn').forEach(btn => {
            btn.classList.remove('selected');
            btn.style.borderColor = '#eee'; // 기본 테두리
            btn.style.backgroundColor = '#fff';
        });

        const selectedBtn = document.getElementById(`opt-${num}`);
        if (selectedBtn) {
            selectedBtn.classList.add('selected');
            selectedBtn.style.borderColor = 'var(--primary)'; // 선택된 강조색
            selectedBtn.style.backgroundColor = '#f0ebff';
        }
    },
    
    async submitAnswer(answerIndex) {
        // 1. 선택 여부 확인
        if (this.selectedOption === null) {
            alert("보기를 선택해주세요!");
            return;
        }
        if (this.isAnswering) return;
        this.isAnswering = true;

        const problem = this.currentQuizData[this.currentIndex];
        const isCorrect = parseInt(problem.answer) === parseInt(this.selectedOption);
        const checkBtn = document.getElementById('btn-check-answer');
        const selectedBtn = document.getElementById(`opt-${this.selectedOption}`);

        // 정답 확인 버튼 숨기기
        if (checkBtn) checkBtn.style.display = 'none';

        // if (!this.isReadOnly) {
            await QuizService.saveHistory({
                quizId: problem.id,
                choiceOption: this.selectedOption,
                correctYn: isCorrect ? 'Y' : 'N',
                solveType: this.isReadOnly? 'WRONG_ONLY' : 'ALL'
            });
        // }

        // 시각적 피드백
        const allButtons = document.querySelectorAll('.option-btn');
        allButtons.forEach((btn, idx) => {
            // 정답 번호에 해당하는 버튼은 초록색
            if (idx === parseInt(answerIndex)) {
                btn.style.backgroundColor = '#d4edda';
                btn.style.borderColor = '#28a745';
                btn.style.color = '#155724';
            }
        });

        // 내가 선택한 것이 오답이면 빨간색
        if (!isCorrect && selectedBtn) {
            selectedBtn.style.backgroundColor = '#f8d7da';
            selectedBtn.style.borderColor = '#dc3545';
            selectedBtn.style.color = '#721c24';
        }

        document.getElementById('explanation-box').style.display = 'block';
        StatsService.incrementTodayCount(isCorrect);
        
        this.currentIndex++; 
        if (this.currentIndex < this.currentQuizData.length) {
            this.saveState(); 
        } else {
            localStorage.removeItem('quiz_state');
        }
    },

    nextStep() {
        // this.currentIndex++;
        if (this.currentIndex < this.currentQuizData.length) {
            this.saveState();
            this.renderProblem();
        } else {
            alert("학습을 완료했습니다!");
            localStorage.removeItem('quiz_state');
            router.navigate('main');
        }
    },

    saveState() {
        localStorage.setItem('quiz_state', JSON.stringify({
            data: this.currentQuizData,
            index: this.currentIndex
        }));
    },

    startSpecialSession(data, isReadOnly = false) {
        this.currentQuizData = data;
        this.currentIndex = 0;
        this.isReadOnly = isReadOnly;
        this.renderProblem();
    },
};

const HistoryUI = {
    currentPage: 1,

    async init() {
        // 1. 레이아웃 먼저 렌더링
        this.renderLayout();
        // 2. 오늘 틀린 문제 개수 가져와서 버튼 업데이트
        this.updateWrongCount();
        // 3. 히스토리 목록 로드
        await this.loadHistory(1);
    },

    async updateWrongCount() {
        const wrongQuizzes = await QuizService.getTodayWrongQuizzes();
        const btn = document.querySelector('.btn-wrong-quiz');
        if (btn) {
            btn.innerHTML = `🔥 오늘 틀린 문제 다시 풀기 <span class="wrong-count">(${wrongQuizzes.length})</span>`;
        }
    },

    renderLayout() {
        const container = document.getElementById('history-content');
        container.innerHTML = `
            <div class="history-header">
                <button class="btn-wrong-quiz" onclick="HistoryUI.startWrongQuiz()">
                    🔥 오늘 틀린 문제 다시 풀기 <span class="wrong-count">(...)</span>
                </button>
            </div>
            <table class="history-table">
                <thead>
                    <tr>
                        <th style="width: 100px;">날짜</th>
                        <th>문제 정보</th> <th style="width: 60px;">결과</th>
                    </tr>
                </thead>
                <tbody id="history-list"></tbody>
            </table>
            <div id="pagination" class="pagination"></div>
        `;
    },

    async loadHistory(page) {
        this.currentPage = page;
        const data = await QuizService.getHistory(page, 20);
        const listBody = document.getElementById('history-list');
        
        listBody.innerHTML = data.list.map(item => {
            const datePart = item.regDtm.substring(0, 10);
            const timePart = item.regDtm.substring(11, 16);
            
            // 문제 내용 내 \n을 실제 줄바꿈으로 변경
            const formattedQuestion = item.question.replace(/\\n/g, '\n');

            return `
                <tr>
                    <td class="col-date">${datePart}<br>${timePart}</td>
                    <td class="col-info">
                        <div style="color: #5b3cc4; font-size: 0.75rem; font-weight: bold; margin-bottom: 4px;">
                            [${item.categoryNm || '일반'}]
                        </div>
                        <div class="question-text-wrapper">${formattedQuestion}</div>
                    </td>
                    <td class="col-result" style="text-align: center;">
                        <span class="result-text ${item.correctYn === 'Y' ? 'success' : 'danger'}">
                            ${item.correctYn === 'Y' ? '✅' : '❌'}
                        </span>
                    </td>
                </tr>
            `;
        }).join('');

        this.renderPagination(data.totalPage);
    },

    renderPagination(totalPage) {
        const pg = document.getElementById('pagination');
        let html = '';
        for (let i = 1; i <= totalPage; i++) {
            html += `<button class="${i === this.currentPage ? 'active' : ''}" onclick="HistoryUI.loadHistory(${i})">${i}</button>`;
        }
        pg.innerHTML = html;
    },

    async startWrongQuiz() {
        const wrongQuizzes = await QuizService.getTodayWrongQuizzes();
        
        // 틀린 문제가 없을 때 메시지 처리
        if (!wrongQuizzes || wrongQuizzes.length === 0) {
            alert("오늘 틀린 문제가 없습니다. 완벽해요! 👍");
            return;
        }
        
        if (confirm(`오늘 틀린 문제 ${wrongQuizzes.length}개를 다시 푸시겠습니까?\n(이 풀이는 기록에 남지 않습니다.)`)) {
            router.navigate('quiz');
            // QuizUI의 특수 세션 시작 (isReadOnly = true)
            QuizUI.startSpecialSession(wrongQuizzes, true); 
        }
    },
};