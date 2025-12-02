document.addEventListener('DOMContentLoaded', () => {
    
    // --- ESTADO DA APLICAÇÃO ---
    let currentTool = 'prontuario'; 
    let selectedFiles = []; // Lista de arquivos (PDFs, Imagens e Áudios)

    // --- VARIÁVEIS DE GRAVAÇÃO DE ÁUDIO ---
    let mediaRecorder = null;
    let audioChunks = [];
    let isRecording = false;

    const TOOLS = {
        prontuario: {
            title: "SuGa PRONTUÁRIO",
            webhook: "https://n8n-n8n-start.zvu2si.easypanel.host/webhook/cfadce39-4d13-4a1e-ac7d-24ed345a5e9c",
            placeholder: "Digite a transcrição do áudio ou anexe arquivos..."
        },
        examinator: {
            title: "SuGa EXAMINATOR",
            webhook: "https://n8n-n8n-start.zvu2si.easypanel.host/webhook/processar-exame",
            placeholder: "Anexe os exames (PDF/Imagem) para análise..."
        },
        brainstorm: {
            title: "SuGa BRAINSTORM",
            webhook: "https://n8n-n8n-start.zvu2si.easypanel.host/webhook/suga-brainstorm",
            placeholder: "Descreva o caso clínico..."
        }
    };

    // DOM ELEMENTS
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const desktopMenuToggle = document.getElementById('desktop-sidebar-toggle');
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mainTitle = document.getElementById('main-title');
    const navItems = document.querySelectorAll('.nav-item[data-tool]');
    const btnNewChat = document.getElementById('btn-new-chat');
    const chatHistory = document.getElementById('chat-history');
    const welcomeScreen = document.getElementById('welcome-screen');
    const chatInput = document.getElementById('chat-input');
    const btnSend = document.getElementById('btn-send');
    const btnAttachment = document.getElementById('btn-attachment');
    const btnMic = document.getElementById('btn-mic'); // Botão do Microfone
    const hiddenFileInput = document.getElementById('hidden-file-input');
    
    // Container para lista de arquivos
    const fileListContainer = document.getElementById('file-list-container');

    // --- SIDEBAR ---
    function toggleMobileMenu() {
        sidebar.classList.toggle('mobile-open');
        sidebarOverlay.classList.toggle('active');
    }
    function closeMobileMenu() {
        sidebar.classList.remove('mobile-open');
        sidebarOverlay.classList.remove('active');
    }
    function toggleDesktopMenu() {
        sidebar.classList.toggle('collapsed');
    }

    if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', toggleMobileMenu);
    if (desktopMenuToggle) desktopMenuToggle.addEventListener('click', toggleDesktopMenu);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeMobileMenu);

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const toolId = item.getAttribute('data-tool');
            setActiveTool(toolId);
            if (window.innerWidth <= 768) closeMobileMenu();
        });
    });

    if(btnNewChat) btnNewChat.addEventListener('click', clearChat);

    function setActiveTool(toolId) {
        navItems.forEach(nav => nav.classList.remove('active'));
        const activeNav = document.querySelector(`.nav-item[data-tool="${toolId}"]`);
        if(activeNav) activeNav.classList.add('active');

        currentTool = toolId;
        const toolData = TOOLS[toolId];
        mainTitle.textContent = toolData.title;
        chatInput.placeholder = toolData.placeholder;
        clearChat();
    }

    function clearChat() {
        const messages = chatHistory.querySelectorAll('.message-wrapper');
        messages.forEach(msg => msg.remove());
        welcomeScreen.style.display = 'block';
        resetFileInput(); // Limpa a lista de arquivos
        chatInput.value = '';
        adjustTextareaHeight(chatInput);
        if (window.innerWidth <= 768) closeMobileMenu();
    }

    // --- LÓGICA DE GRAVAÇÃO DE ÁUDIO (MICROFONE) ---

    if (btnMic) {
        btnMic.addEventListener('click', toggleRecording);
    }

    async function toggleRecording() {
        if (!isRecording) {
            await startRecording();
        } else {
            stopRecording();
        }
    }

    async function startRecording() {
        if (selectedFiles.length >= 10) {
            alert("Limite máximo de arquivos atingido. Remova um anexo antes de gravar.");
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                // Cria o arquivo de áudio (WebM é padrão da web)
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                const fileName = `gravacao_${Date.now()}.webm`;
                const audioFile = new File([audioBlob], fileName, { type: 'audio/webm' });

                // Adiciona como se fosse um upload
                selectedFiles.push(audioFile);
                renderFileList();

                // Libera o microfone
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            isRecording = true;

            // UI: Feedback visual
            btnMic.classList.add('recording');
            btnMic.querySelector('span').textContent = 'stop_circle'; // Ícone de Stop
            btnMic.title = "Parar Gravação";
            chatInput.placeholder = "Gravando áudio... Clique no botão vermelho para parar.";
            
        } catch (err) {
            console.error("Erro ao acessar microfone:", err);
            alert("Erro: Não foi possível acessar o microfone. Verifique as permissões do navegador.");
        }
    }

    function stopRecording() {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
            isRecording = false;

            // Restaura UI
            btnMic.classList.remove('recording');
            btnMic.querySelector('span').textContent = 'mic';
            btnMic.title = "Gravar Áudio";
            chatInput.placeholder = TOOLS[currentTool].placeholder;
        }
    }

    // --- LÓGICA DE MÚLTIPLOS ARQUIVOS (UPLOAD) ---

    btnAttachment.addEventListener('click', () => hiddenFileInput.click());

    hiddenFileInput.addEventListener('change', (e) => {
        const newFiles = Array.from(e.target.files);
        
        // Validação de limite (Max 10)
        if (selectedFiles.length + newFiles.length > 10) {
            alert("Limite máximo de 10 arquivos atingido.");
            return;
        }

        selectedFiles = [...selectedFiles, ...newFiles];
        renderFileList();
        hiddenFileInput.value = ''; // Reseta para permitir selecionar o mesmo arquivo se quiser
    });

    function renderFileList() {
        fileListContainer.innerHTML = '';
        
        if (selectedFiles.length === 0) {
            fileListContainer.style.display = 'none';
            return;
        }

        fileListContainer.style.display = 'flex';

        selectedFiles.forEach((file, index) => {
            const chip = document.createElement('div');
            chip.classList.add('file-chip');
            
            // Ícone dinâmico (Áudio vs Texto)
            const icon = document.createElement('span');
            icon.className = 'material-symbols-outlined';
            icon.style.fontSize = '1.1rem';
            
            if (file.type.includes('audio') || file.name.endsWith('.webm')) {
                icon.textContent = 'mic'; // Ícone de áudio
            } else {
                icon.textContent = 'description'; // Ícone de documento
            }

            const name = document.createElement('span');
            name.className = 'file-name';
            name.textContent = file.name;

            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-btn';
            removeBtn.innerHTML = '&times;';
            removeBtn.onclick = () => removeFile(index);

            chip.appendChild(icon);
            chip.appendChild(name);
            chip.appendChild(removeBtn);
            
            fileListContainer.appendChild(chip);
        });
    }

    function removeFile(index) {
        selectedFiles.splice(index, 1);
        renderFileList();
    }

    function resetFileInput() {
        selectedFiles = [];
        renderFileList();
    }

    // --- INPUT TEXTO ---
    chatInput.addEventListener('input', function() { adjustTextareaHeight(this); });
    function adjustTextareaHeight(el) {
        el.style.height = 'auto';
        el.style.height = (el.scrollHeight) + 'px';
        if(el.value === '') el.style.height = 'auto';
    }
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });

    btnSend.addEventListener('click', handleSend);

    // --- ENVIO ---
    async function handleSend() {
        // Se estiver gravando, para antes de enviar
        if (isRecording) {
            stopRecording();
            // Pequeno delay para garantir que o arquivo de áudio foi processado
            await new Promise(r => setTimeout(r, 500));
        }

        const text = chatInput.value.trim();
        
        // Verifica se tem algo para enviar (texto OU arquivos)
        if (!text && selectedFiles.length === 0) return;

        welcomeScreen.style.display = 'none';
        
        // Prepara lista de nomes para mostrar no chat do usuário
        const fileNames = selectedFiles.map(f => f.name);
        addUserMessage(text, fileNames);

        // Limpa UI imediatamente
        chatInput.value = '';
        chatInput.style.height = 'auto';
        
        // Clona a lista para envio e limpa o estado
        const filesToSend = [...selectedFiles];
        resetFileInput(); 
        
        const loadingId = addLoadingMessage();
        scrollToBottom();

        const toolData = TOOLS[currentTool];
        const formData = new FormData();

        // Loop para anexar múltiplos arquivos com chaves únicas
        if (filesToSend.length > 0) {
            filesToSend.forEach((file, index) => {
                // Usa file_0, file_1, file_2... para o backend identificar
                formData.append(`file_${index}`, file);
            });
        }

        if (text) formData.append('textoBruto', text);

        try {
            const response = await fetch(toolData.webhook, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error(`Erro na API: ${response.statusText}`);

            const data = await response.json();
            const aiResponse = data.resumoCompleto || data.text || JSON.stringify(data);

            removeMessage(loadingId);
            addAiMessage(aiResponse);

        } catch (error) {
            console.error(error);
            removeMessage(loadingId);
            let errorMsg = "Ocorreu um erro ao processar sua solicitação.";
            if (error.name === 'SyntaxError') errorMsg = "O servidor demorou para responder. Tente enviar menos arquivos de cada vez.";
            addAiMessage(errorMsg);
        }
        
        scrollToBottom();
    }

    // --- RENDERIZAR MENSAGENS ---
    function addUserMessage(text, fileNames) {
        const wrapper = document.createElement('div');
        wrapper.classList.add('message-wrapper', 'user');
        
        let contentHtml = '';
        
        if (fileNames && fileNames.length > 0) {
            fileNames.forEach(name => {
                // Verifica se é áudio para ícone diferente no chat
                const isAudio = name.endsWith('.webm') || name.includes('audio');
                const icon = isAudio ? 'mic' : 'description';

                contentHtml += `<div style="display:flex; align-items:center; gap:5px; margin-bottom:5px; color:#a8c7fa; font-size:0.85rem; background:rgba(0,0,0,0.2); padding:4px 8px; border-radius:4px;">
                    <span class="material-symbols-outlined" style="font-size:1rem;">${icon}</span> ${name}
                </div>`;
            });
        }
        
        if (text) {
            contentHtml += `<div>${text.replace(/\n/g, '<br>')}</div>`;
        }

        wrapper.innerHTML = `
            <div class="message-content">${contentHtml}</div>
            <div class="avatar-icon user">VC</div>
        `;
        chatHistory.appendChild(wrapper);
    }

    function addAiMessage(text) {
        const wrapper = document.createElement('div');
        wrapper.classList.add('message-wrapper', 'ai');
        wrapper.innerHTML = `
            <div class="avatar-icon ai">
                <span class="material-symbols-outlined" style="font-size:1.1rem;">smart_toy</span>
            </div>
            <div class="message-content">
                <pre>${text}</pre>
                <div style="margin-top:8px; display:flex; justify-content:flex-end;">
                    <span class="material-symbols-outlined" style="cursor:pointer; font-size:1.1rem; color:#666;" onclick="copyText(this)">content_copy</span>
                </div>
            </div>
        `;
        chatHistory.appendChild(wrapper);
    }

    function addLoadingMessage() {
        const id = 'loading-' + Date.now();
        const wrapper = document.createElement('div');
        wrapper.classList.add('message-wrapper', 'ai');
        wrapper.id = id;
        wrapper.innerHTML = `
            <div class="avatar-icon ai">
                <span class="material-symbols-outlined" style="font-size:1.1rem;">smart_toy</span>
            </div>
            <div class="message-content">
                <div class="typing-indicator"><span></span><span></span><span></span></div>
            </div>
        `;
        chatHistory.appendChild(wrapper);
        return id;
    }

    function removeMessage(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    function scrollToBottom() {
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }

    window.copyText = function(btn) {
        const pre = btn.closest('.message-content').querySelector('pre');
        navigator.clipboard.writeText(pre.textContent).then(() => {
            btn.style.color = '#4caf50';
            setTimeout(() => { btn.style.color = '#666'; }, 2000);
        });
    };
});