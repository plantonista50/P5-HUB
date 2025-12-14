document.addEventListener('DOMContentLoaded', () => {
    // --- ESTADO GLOBAL ---
    let currentTool = 'prontuario'; 
    let selectedFiles = []; 
    let currentUser = null; 
    let currentLeito = "";  
    let patientHistory = {}; 
    let activeSet = new Set(); 
    let mediaRecorder = null;
    let audioChunks = [];
    let isRecording = false;

    // --- CONFIGURAÇÃO ---
    // Mude USE_REAL_BACKEND para true quando quiser conectar de verdade
    const USE_REAL_BACKEND = false; 
    
    const AUTH_WEBHOOK = "https://n8n-n8n-start.zvu2si.easypanel.host/webhook/suga-auth"; 

    const TOOLS = {
        prontuario: { title: "SuGa PRONTUÁRIO", webhook: "https://n8n-n8n-start.zvu2si.easypanel.host/webhook/cfadce39-4d13-4a1e-ac7d-24ed345a5e9c", placeholder: "Evolução do paciente..." },
        examinator: { title: "SuGa EXAMINATOR", webhook: "https://n8n-n8n-start.zvu2si.easypanel.host/webhook/processar-exame", placeholder: "Anexe os exames..." },
        brainstorm: { title: "SuGa BRAINSTORM", webhook: "https://n8n-n8n-start.zvu2si.easypanel.host/webhook/suga-brainstorm", placeholder: "Descreva o caso..." }
    };

    // DOM ELEMENTS
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const desktopMenuToggle = document.getElementById('desktop-sidebar-toggle');
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mainTitle = document.getElementById('main-title');
    const navItems = document.querySelectorAll('.nav-item[data-tool]');
    const chatHistory = document.getElementById('chat-history');
    const welcomeScreen = document.getElementById('welcome-screen');
    const chatInput = document.getElementById('chat-input');
    const btnSend = document.getElementById('btn-send');
    const btnAttachment = document.getElementById('btn-attachment');
    const btnMic = document.getElementById('btn-mic');
    const hiddenFileInput = document.getElementById('hidden-file-input');
    const fileListContainer = document.getElementById('file-list-container');
    const userAvatarDisplay = document.getElementById('user-avatar-display');
    const leitoSelect = document.getElementById('leito-select');
    const customLeitoInput = document.getElementById('custom-leito');
    const patientListDiv = document.getElementById('active-patients-list');
    const patientCountBadge = document.getElementById('patient-count');
    const btnGerarIpass = document.getElementById('btn-gerar-ipass');

    // AUTH Elements
    const loginScreen = document.getElementById('login-screen');
    const loginForm = document.getElementById('login-form');
    const linkSignup = document.getElementById('link-signup');
    const linkForgot = document.getElementById('link-forgot');
    const signupModal = document.getElementById('signup-modal');
    const forgotModal = document.getElementById('forgot-modal');
    const closeButtons = document.querySelectorAll('.close-modal');
    const signupForm = document.getElementById('signup-form');
    const forgotStep1 = document.getElementById('forgot-step-1');
    const forgotStep2 = document.getElementById('forgot-step-2');

    // --- AUTH LOGIC ---
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const btn = loginForm.querySelector('button');
        const originalBtnText = btn.textContent;
        
        btn.textContent = "Autenticando..."; 
        btn.disabled = true;

        if(USE_REAL_BACKEND) {
            try {
                const response = await fetch(AUTH_WEBHOOK, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'login', email, password })
                });
                
                let data = await response.json();
                if (Array.isArray(data)) data = data[0]; 

                if (data && data.access_token) {
                    currentUser = { email: data.user.email, token: data.access_token, initials: (data.user.email || "MD").substring(0,2).toUpperCase() };
                    userAvatarDisplay.innerHTML = `<div class="avatar-placeholder" style="background-color:#4caf50">${currentUser.initials}</div>`;
                    loginScreen.style.opacity = '0';
                    setTimeout(() => { loginScreen.style.display = 'none'; }, 300);
                } else {
                    let msg = data.error_description || data.msg || data.message || "Credenciais inválidas.";
                    alert("Erro: " + msg);
                    btn.textContent = originalBtnText; 
                    btn.disabled = false;
                }
            } catch (err) {
                console.error(err); 
                alert("Erro de conexão com o servidor.");
                btn.textContent = originalBtnText; 
                btn.disabled = false;
            } 
        } else {
            // MODO SIMULAÇÃO
            if(email && password) {
                setTimeout(() => {
                    currentUser = { email: email, token: "fake", initials: email.substring(0,2).toUpperCase() };
                    userAvatarDisplay.innerHTML = `<div class="avatar-placeholder" style="background-color:#4caf50">${currentUser.initials}</div>`;
                    loginScreen.style.opacity = '0';
                    setTimeout(() => { loginScreen.style.display = 'none'; }, 300);
                }, 500);
            }
        }
    });

    linkSignup.addEventListener('click', (e) => { e.preventDefault(); signupModal.style.display = 'flex'; });
    linkForgot.addEventListener('click', (e) => { e.preventDefault(); forgotModal.style.display = 'flex'; });

    closeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            signupModal.style.display = 'none'; forgotModal.style.display = 'none';
            forgotStep1.style.display = 'block'; forgotStep2.style.display = 'none';
        });
    });

    // --- APP LOGIC ---
    leitoSelect.addEventListener('change', (e) => {
        if(e.target.value === 'new') { 
            customLeitoInput.style.display = 'block'; 
            customLeitoInput.focus(); 
            currentLeito = ""; 
            renderChatHistory(""); 
        } else { 
            customLeitoInput.style.display = 'none'; 
            currentLeito = e.target.value; 
            renderChatHistory(currentLeito); 
        }
    });
    customLeitoInput.addEventListener('input', (e) => { currentLeito = e.target.value; });

    function toggleMobileMenu() { sidebar.classList.toggle('mobile-open'); sidebarOverlay.classList.toggle('active'); }
    function closeMobileMenu() { sidebar.classList.remove('mobile-open'); sidebarOverlay.classList.remove('active'); }
    if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', toggleMobileMenu);
    if (desktopMenuToggle) desktopMenuToggle.addEventListener('click', () => sidebar.classList.toggle('collapsed'));
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeMobileMenu);

    navItems.forEach(item => {
        item.addEventListener('click', () => { 
            const tool = item.getAttribute('data-tool');
            setActiveTool(tool); 
            if (window.innerWidth <= 768) closeMobileMenu();
            if (tool === 'examinator') {
                currentLeito = "";
                leitoSelect.value = "";
                customLeitoInput.style.display = 'none';
                renderChatHistory("");
            }
        });
    });

    function setActiveTool(toolId) {
        navItems.forEach(nav => nav.classList.remove('active'));
        document.querySelector(`.nav-item[data-tool="${toolId}"]`).classList.add('active');
        currentTool = toolId;
        mainTitle.textContent = TOOLS[toolId].title;
        chatInput.placeholder = TOOLS[toolId].placeholder;
    }

    function saveToHistory(leito, msgObj) { if (!leito) return; if (!patientHistory[leito]) patientHistory[leito] = []; patientHistory[leito].push(msgObj); }
    
    function renderChatHistory(leito) {
        chatHistory.querySelectorAll('.message-wrapper').forEach(msg => msg.remove());
        document.querySelectorAll('.patient-chip').forEach(c => c.classList.remove('active'));
        
        if (leito) {
            const activeChip = document.querySelector(`.patient-chip[data-leito="${leito}"]`);
            if(activeChip) activeChip.classList.add('active');
        }

        if (!leito || !patientHistory[leito] || patientHistory[leito].length === 0) {
            welcomeScreen.style.display = 'block';
            welcomeScreen.querySelector('h1').textContent = leito ? "Inicie a evolução do " + leito : "Selecione um leito ou inicie uma análise livre.";
            return;
        }
        welcomeScreen.style.display = 'none';
        patientHistory[leito].forEach(msg => { msg.type === 'user' ? addUserMessage(msg.htmlContent) : addAiMessage(msg.textContent); });
        scrollToBottom();
    }

    if (btnMic) btnMic.addEventListener('click', async () => {
        if (!isRecording) {
            if (selectedFiles.length >= 10) return alert("Limite de arquivos.");
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder = new MediaRecorder(stream);
                audioChunks = [];
                mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
                mediaRecorder.onstop = () => {
                    selectedFiles.push(new File([new Blob(audioChunks, {type: 'audio/webm'})], `rec_${Date.now()}.webm`, {type: 'audio/webm'}));
                    renderFileList();
                    stream.getTracks().forEach(t => t.stop());
                };
                mediaRecorder.start();
                isRecording = true;
                btnMic.classList.add('recording');
            } catch (e) {
                alert("Erro ao acessar microfone. Verifique as permissões.");
            }
        } else {
            mediaRecorder?.stop();
            isRecording = false;
            btnMic.classList.remove('recording');
        }
    });

    btnAttachment.addEventListener('click', () => hiddenFileInput.click());
    hiddenFileInput.addEventListener('change', (e) => {
        selectedFiles = [...selectedFiles, ...Array.from(e.target.files)].slice(0, 10);
        renderFileList();
        hiddenFileInput.value = '';
    });
    function renderFileList() {
        fileListContainer.innerHTML = '';
        fileListContainer.style.display = selectedFiles.length ? 'flex' : 'none';
        selectedFiles.forEach((file, idx) => {
            const chip = document.createElement('div');
            chip.className = 'file-chip';
            chip.innerHTML = `<span class="material-symbols-outlined">${file.name.endsWith('webm') ? 'mic' : 'description'}</span> <span class="file-name">${file.name}</span> <button class="remove-btn" onclick="removeFile(${idx})">&times;</button>`;
            fileListContainer.appendChild(chip);
        });
        window.removeFile = idx => { selectedFiles.splice(idx, 1); renderFileList(); };
    }

    btnSend.addEventListener('click', handleSend);
    chatInput.addEventListener('keydown', e => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } });

    async function handleSend() {
        if (currentTool === 'prontuario' && !currentLeito) {
            alert("⚠️ Para evoluir um prontuário, é OBRIGATÓRIO selecionar um leito.");
            return;
        }

        const isLinkedToPatient = !!currentLeito; 
        const contextName = isLinkedToPatient ? currentLeito : "Assistente Geral";

        if (isRecording) btnMic.click();
        
        const text = chatInput.value.trim();
        if (!text && !selectedFiles.length) return;
        
        welcomeScreen.style.display = 'none';

        let filesHtml = selectedFiles.map(f => `<div style="font-size:0.8rem;color:#a8c7fa"><span class="material-symbols-outlined" style="font-size:0.9rem;vertical-align:middle">attachment</span> ${f.name}</div>`).join('');
        const modeLabel = isLinkedToPatient ? "" : " <span style='opacity:0.6; font-size:0.7em;'>(Modo Livre)</span>";
        
        // --- QUEBRA DE LINHA PARA USUÁRIO ---
        let userHtml = `<div style="font-size:0.7rem;color:#666">[${TOOLS[currentTool].title.replace("SuGa ","")}]${modeLabel}</div>${filesHtml}<div>${text.replace(/\n/g,'<br>')}</div>`;
        
        addUserMessage(userHtml);

        if (isLinkedToPatient) {
            saveToHistory(currentLeito, { type: 'user', htmlContent: userHtml });
            updatePatientList(currentLeito); 
        }

        chatInput.value = '';
        let filesToSend = [...selectedFiles];
        selectedFiles = []; 
        renderFileList();
        
        const loadingId = addLoadingMessage();
        scrollToBottom();

        const formData = new FormData();
        formData.append('leito_alias', contextName);
        if(text) formData.append('textoBruto', text);
        filesToSend.forEach((f, i) => formData.append(`file_${i}`, f));

        try {
            const res = await fetch(TOOLS[currentTool].webhook, { method: 'POST', body: formData });
            const data = await res.json();
            const aiText = data.resumoCompleto || data.text || data.output || JSON.stringify(data);
            
            removeMessage(loadingId);
            
            let appended = false;

            if (isLinkedToPatient && patientHistory[currentLeito]) {
                const history = patientHistory[currentLeito];
                let lastAiIndex = -1;
                for(let i = history.length -1; i >= 0; i--) { if(history[i].type === 'ai') { lastAiIndex = i; break; } }
                
                if(lastAiIndex !== -1 && currentTool !== 'brainstorm') {
                    const time = new Date().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
                    let header = "";
                    if(currentTool === 'examinator') header = `\n\n--- 📎 ADENDO EXAME (${time}) ---\n`;
                    else if(currentTool === 'prontuario') header = `\n\n--- 🕒 EM TEMPO (${time}) ---\n`;
                    
                    if(header) {
                        history[lastAiIndex].textContent += header + aiText;
                        if(currentLeito === contextName) renderChatHistory(contextName);
                        appended = true;
                    }
                }
            }

            if(!appended) {
                addAiMessage(aiText);
                if(isLinkedToPatient) {
                    saveToHistory(currentLeito, { type: 'ai', textContent: aiText });
                }
            }

        } catch (e) {
            console.error(e);
            removeMessage(loadingId);
            addAiMessage("⚠️ Erro de conexão.");
        }
    }

    function addUserMessage(html) {
        const div = document.createElement('div'); div.className = 'message-wrapper user';
        div.innerHTML = `<div class="message-content">${html}</div><div class="avatar-icon user">${currentUser?.initials || 'MD'}</div>`;
        chatHistory.appendChild(div);
    }

    // --- FUNÇÃO MODIFICADA: ADICIONA O BOTÃO DE COPIAR ---
    function addAiMessage(text) {
        const div = document.createElement('div'); div.className = 'message-wrapper ai';
        div.innerHTML = `
            <div class="avatar-icon ai">
                <span class="material-symbols-outlined">smart_toy</span>
            </div>
            <div class="message-content">
                <button class="copy-btn" onclick="copyText(this)" title="Copiar Prontuário">
                    <span class="material-symbols-outlined">content_copy</span>
                </button>
                <pre>${text}</pre>
            </div>`;
        chatHistory.appendChild(div);
    }

    // --- NOVA FUNÇÃO GLOBAL DE COPIAR ---
    window.copyText = function(btn) {
        const pre = btn.parentElement.querySelector('pre');
        
        if (pre) {
            navigator.clipboard.writeText(pre.innerText).then(() => {
                const icon = btn.querySelector('span');
                const originalIcon = icon.innerText;
                
                icon.innerText = 'check'; 
                btn.style.color = '#4caf50';
                
                setTimeout(() => {
                    icon.innerText = originalIcon;
                    btn.style.color = ''; 
                }, 2000);
            }).catch(err => {
                console.error("Erro ao copiar: ", err);
            });
        }
    };

    function addLoadingMessage() {
        const id = 'ld-'+Date.now();
        const div = document.createElement('div'); div.className = 'message-wrapper ai'; div.id = id;
        div.innerHTML = `<div class="avatar-icon ai"><span class="material-symbols-outlined">smart_toy</span></div><div class="message-content">...</div>`;
        chatHistory.appendChild(div);
        return id;
    }
    function removeMessage(id) { document.getElementById(id)?.remove(); }
    function scrollToBottom() { chatHistory.scrollTop = chatHistory.scrollHeight; }

    function updatePatientList(leito) {
        if(!activeSet.has(leito)) {
            activeSet.add(leito);
            
            const chip = document.createElement('div'); 
            chip.className = 'patient-chip';
            chip.setAttribute('data-leito', leito);
            if(leito === currentLeito) chip.classList.add('active');

            chip.innerHTML = `
                <div class="chip-info">
                    <span class="material-symbols-outlined chip-icon">bed</span>
                    <span class="chip-name">${leito}</span>
                </div>
            `;
            
            const delBtn = document.createElement('button');
            delBtn.className = 'chip-delete';
            delBtn.innerHTML = '<span class="material-symbols-outlined">close</span>';
            
            delBtn.onclick = (e) => {
                e.stopPropagation(); 
                if(confirm(`Remover ${leito}?`)) {
                    activeSet.delete(leito);
                    delete patientHistory[leito];
                    chip.remove();
                    patientCountBadge.textContent = activeSet.size;
                    
                    if(activeSet.size === 0) {
                        patientListDiv.innerHTML = '<div class="empty-ribbon-state">Selecione um leito abaixo</div>';
                        btnGerarIpass.style.display = 'none';
                    }

                    if(currentLeito === leito) {
                        currentLeito = "";
                        leitoSelect.value = "";
                        customLeitoInput.style.display = 'none';
                        renderChatHistory("");
                    }
                }
            };
            
            chip.appendChild(delBtn);

            chip.onclick = (e) => { 
                if(!e.target.closest('.chip-delete')) {
                    leitoSelect.value = leito; 
                    currentLeito = leito;
                    renderChatHistory(leito);
                }
            };
            
            patientListDiv.appendChild(chip);
            patientListDiv.querySelector('.empty-ribbon-state')?.remove();
            patientCountBadge.textContent = activeSet.size;
            if(activeSet.size > 0) btnGerarIpass.style.display = 'flex';
        }
    }
});
