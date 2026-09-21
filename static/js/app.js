/* ==========================================================================
   Groq AI Chatbot - Client Application Logic
   ========================================================================== */

(function () {
    "use strict";

    // Application State
    let currentChatId = null;
    let isStreaming = false;
    let abortController = null;
    let currentAttachments = [];
    let userSettings = {
        theme: "dark",
        font_size: "normal",
        language: "en",
        personality: "helpful",
        custom_system_prompt: "",
        preferred_model: "llama-3.3-70b-versatile",
        auto_speak: false
    };

    // Speech & Voice State
    let speechRecognition = null;
    let isSpeechRecognitionActive = false;
    let mediaRecorder = null;
    let audioChunks = [];
    let currentUtterance = null;
    let isVoiceModeActive = false;
    let voiceModeListening = false;
    let isImageMode = false;

    // DOM Elements
    const elements = {
        // Layout
        sidebar: document.getElementById("sidebar"),
        openSidebarBtn: document.getElementById("openSidebarBtn"),
        closeSidebarBtn: document.getElementById("closeSidebarBtn"),
        
        // Chat List & Management
        newChatBtn: document.getElementById("newChatBtn"),
        searchChatInput: document.getElementById("searchChatInput"),
        chatListContainer: document.getElementById("chatListContainer"),
        chatsToday: document.getElementById("chatsToday"),
        chatsYesterday: document.getElementById("chatsYesterday"),
        chatsPrevious: document.getElementById("chatsPrevious"),
        chatsOlder: document.getElementById("chatsOlder"),
        emptyChatsMsg: document.getElementById("emptyChatsMsg"),
        currentChatTitle: document.getElementById("currentChatTitle"),
        renameCurrentChatBtn: document.getElementById("renameCurrentChatBtn"),
        
        // Chat Area
        chatViewport: document.getElementById("chatViewport"),
        welcomeHero: document.getElementById("welcomeHero"),
        messagesList: document.getElementById("messagesList"),
        
        // Input
        messageInput: document.getElementById("messageInput"),
        sendBtn: document.getElementById("sendBtn"),
        attachFileBtn: document.getElementById("attachFileBtn"),
        fileInput: document.getElementById("fileInput"),
        micBtn: document.getElementById("micBtn"),
        attachmentsDrawer: document.getElementById("attachmentsDrawer"),
        attachmentChipsList: document.getElementById("attachmentChipsList"),
        dragDropOverlay: document.getElementById("dragDropOverlay"),
        
        // Top Bar
        modelSelector: document.getElementById("modelSelector"),
        openVoiceModeBtn: document.getElementById("openVoiceModeBtn"),
        themeToggleBtn: document.getElementById("themeToggleBtn"),
        openSettingsHeaderBtn: document.getElementById("openSettingsHeaderBtn"),
        openSettingsFooterBtn: document.getElementById("openSettingsFooterBtn"),
        
        // Voice Mode Modal
        voiceModal: document.getElementById("voiceModal"),
        closeVoiceModeBtn: document.getElementById("closeVoiceModeBtn"),
        voiceOrb: document.getElementById("voiceOrb"),
        voiceStatusText: document.getElementById("voiceStatusText"),
        voiceTranscriptContent: document.getElementById("voiceTranscriptContent"),
        voiceToggleListenBtn: document.getElementById("voiceToggleListenBtn"),
        voiceToggleListenText: document.getElementById("voiceToggleListenText"),
        voiceInterruptBtn: document.getElementById("voiceInterruptBtn"),
        
        // Settings Modal
        settingsModal: document.getElementById("settingsModal"),
        settingsBackdrop: document.getElementById("settingsBackdrop"),
        closeSettingsBtn: document.getElementById("closeSettingsBtn"),
        cancelSettingsBtn: document.getElementById("cancelSettingsBtn"),
        saveSettingsBtn: document.getElementById("saveSettingsBtn"),
        modalTabBtns: document.querySelectorAll(".modal-tab-btn"),
        tabPanes: document.querySelectorAll(".tab-pane"),
        settingThemeRadios: document.querySelectorAll('input[name="settingTheme"]'),
        settingBackgroundRadios: document.querySelectorAll('input[name="settingBackground"]'),
        quickBgBtn: document.getElementById("quickBgBtn"),
        settingFontSize: document.getElementById("settingFontSize"),
        settingLanguage: document.getElementById("settingLanguage"),
        settingPersonality: document.getElementById("settingPersonality"),
        settingCustomPrompt: document.getElementById("settingCustomPrompt"),
        customPromptContainer: document.getElementById("customPromptContainer"),
        settingAutoSpeak: document.getElementById("settingAutoSpeak"),
        settingPreferredModel: document.getElementById("settingPreferredModel"),
        settingApiKeyInput: document.getElementById("settingApiKeyInput"),
        saveApiKeyBtn: document.getElementById("saveApiKeyBtn"),
        currentPasswordInput: document.getElementById("currentPasswordInput"),
        newPasswordInput: document.getElementById("newPasswordInput"),
        updatePasswordBtn: document.getElementById("updatePasswordBtn"),
        
        // Rename Modal
        renameModal: document.getElementById("renameModal"),
        renameBackdrop: document.getElementById("renameBackdrop"),
        closeRenameBtn: document.getElementById("closeRenameBtn"),
        cancelRenameBtn: document.getElementById("cancelRenameBtn"),
        confirmRenameBtn: document.getElementById("confirmRenameBtn"),
        renameChatInput: document.getElementById("renameChatInput"),
        
        // Image Mode & Lightbox
        imageModeBtn: document.getElementById("imageModeBtn"),
        imageLightbox: document.getElementById("imageLightbox"),
        lightboxBackdrop: document.getElementById("lightboxBackdrop"),
        lightboxCloseBtn: document.getElementById("lightboxCloseBtn"),
        lightboxImg: document.getElementById("lightboxImg"),
        lightboxDownloadBtn: document.getElementById("lightboxDownloadBtn"),

        // Toasts
        toastContainer: document.getElementById("toastContainer")
    };

    // ================= Initialization ================= //
    
    function init() {
        configureMarked();
        setupEventListeners();
        setupSpeechRecognition();
        fetchCurrentUserAndSettings();
        loadChatsList();
    }

    function configureMarked() {
        if (typeof marked !== "undefined") {
            marked.setOptions({
                highlight: function (code, lang) {
                    if (typeof hljs !== "undefined" && lang && hljs.getLanguage(lang)) {
                        try {
                            return hljs.highlight(code, { language: lang }).value;
                        } catch (err) {}
                    }
                    if (typeof hljs !== "undefined") {
                        try {
                            return hljs.highlightAuto(code).value;
                        } catch (err) {}
                    }
                    return code;
                },
                breaks: true,
                gfm: true
            });
        }
    }

    // ================= Event Listeners ================= //

    function setupEventListeners() {
        // Sidebar Toggles
        if (elements.openSidebarBtn) {
            elements.openSidebarBtn.addEventListener("click", () => {
                elements.sidebar.classList.add("open");
            });
        }
        if (elements.closeSidebarBtn) {
            elements.closeSidebarBtn.addEventListener("click", () => {
                elements.sidebar.classList.remove("open");
            });
        }

        // New Chat
        if (elements.newChatBtn) {
            elements.newChatBtn.addEventListener("click", startNewChat);
        }

        // Search Chats
        if (elements.searchChatInput) {
            elements.searchChatInput.addEventListener("input", filterChatsList);
        }

        // Message Input Auto-resize & Keypress
        if (elements.messageInput) {
            elements.messageInput.addEventListener("input", function () {
                this.style.height = "auto";
                this.style.height = Math.min(this.scrollHeight, 180) + "px";
            });
            elements.messageInput.addEventListener("keydown", function (e) {
                if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }
            });
        }

        // Send Button
        if (elements.sendBtn) {
            elements.sendBtn.addEventListener("click", sendMessage);
        }

        // Starter Cards
        document.querySelectorAll(".starter-card").forEach(card => {
            card.addEventListener("click", function () {
                const promptText = this.getAttribute("data-prompt");
                if (elements.messageInput) {
                    elements.messageInput.value = promptText;
                    elements.messageInput.focus();
                    sendMessage();
                }
            });
        });

        // Theme Toggle Button
        if (elements.themeToggleBtn) {
            elements.themeToggleBtn.addEventListener("click", toggleTheme);
        }

        // Quick Dragon Background Button
        if (elements.quickBgBtn) {
            elements.quickBgBtn.addEventListener("click", cycleBackground);
        }

        // Model Selector
        if (elements.modelSelector) {
            elements.modelSelector.addEventListener("change", function () {
                userSettings.preferred_model = this.value;
                updateSettingsRemote({ preferred_model: this.value });
                showToast(`Switched model to ${this.options[this.selectedIndex].text}`);
            });
        }

        // File Attachment
        if (elements.attachFileBtn && elements.fileInput) {
            elements.attachFileBtn.addEventListener("click", () => elements.fileInput.click());
            elements.fileInput.addEventListener("change", handleFileUpload);
        }

        // Image Mode Toggle Button
        if (elements.imageModeBtn) {
            elements.imageModeBtn.addEventListener("click", () => {
                isImageMode = !isImageMode;
                elements.imageModeBtn.classList.toggle("active", isImageMode);
                if (isImageMode) {
                    showToast("🎨 Image Reply Mode ON: Prompt will generate an AI image!");
                    elements.messageInput.placeholder = "Describe image to generate... (e.g. golden dragon flying over castle)";
                    elements.messageInput.focus();
                } else {
                    showToast("💬 Text Chat Mode Active");
                    elements.messageInput.placeholder = "Message Groq AI or toggle 🖼️ Image Mode... (Shift+Enter for new line)";
                }
            });
        }

        // Lightbox Close Handlers
        if (elements.lightboxCloseBtn) {
            elements.lightboxCloseBtn.addEventListener("click", closeImageLightbox);
        }
        if (elements.lightboxBackdrop) {
            elements.lightboxBackdrop.addEventListener("click", closeImageLightbox);
        }

        // Drag and Drop Files
        setupDragAndDrop();

        // Microphone Button
        if (elements.micBtn) {
            elements.micBtn.addEventListener("click", toggleSpeechToText);
        }

        // Voice Mode Modal
        if (elements.openVoiceModeBtn) {
            elements.openVoiceModeBtn.addEventListener("click", openVoiceMode);
        }
        if (elements.closeVoiceModeBtn) {
            elements.closeVoiceModeBtn.addEventListener("click", closeVoiceMode);
        }
        if (elements.voiceToggleListenBtn) {
            elements.voiceToggleListenBtn.addEventListener("click", toggleVoiceModeListening);
        }
        if (elements.voiceInterruptBtn) {
            elements.voiceInterruptBtn.addEventListener("click", stopSpeakingUtterance);
        }

        // Settings Modals
        if (elements.openSettingsHeaderBtn) {
            elements.openSettingsHeaderBtn.addEventListener("click", openSettingsModal);
        }
        if (elements.openSettingsFooterBtn) {
            elements.openSettingsFooterBtn.addEventListener("click", openSettingsModal);
        }
        if (elements.closeSettingsBtn) {
            elements.closeSettingsBtn.addEventListener("click", closeSettingsModal);
        }
        if (elements.cancelSettingsBtn) {
            elements.cancelSettingsBtn.addEventListener("click", closeSettingsModal);
        }
        if (elements.settingsBackdrop) {
            elements.settingsBackdrop.addEventListener("click", closeSettingsModal);
        }
        if (elements.saveSettingsBtn) {
            elements.saveSettingsBtn.addEventListener("click", saveSettingsFromModal);
        }

        // Save Groq API Key
        if (elements.saveApiKeyBtn && elements.settingApiKeyInput) {
            elements.saveApiKeyBtn.addEventListener("click", async () => {
                const key = elements.settingApiKeyInput.value.trim();
                if (!key || key.length < 10) {
                    showToast("Please enter a valid Groq API key (starts with gsk_)", true);
                    return;
                }
                try {
                    const res = await fetch("/api/config/key", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ api_key: key })
                    });
                    const data = await res.json();
                    if (res.ok) {
                        showToast("Groq API key saved to .even and .env!");
                        elements.settingApiKeyInput.value = "";
                        const warnCard = document.querySelector(".api-key-warning-card");
                        if (warnCard) warnCard.style.display = "none";
                        const statusCard = document.querySelector(".api-status-card");
                        if (statusCard) {
                            statusCard.className = "api-status-card status-connected";
                            const strongEl = statusCard.querySelector("strong");
                            if (strongEl) strongEl.textContent = "Groq API Key Status: Connected";
                        }
                    } else {
                        showToast(data.error || "Failed to save key", true);
                    }
                } catch (e) {
                    showToast("Error saving API key", true);
                }
            });
        }

        // Clicking warning banner opens API settings tab
        const warnBanner = document.querySelector(".api-key-warning-card");
        if (warnBanner) {
            warnBanner.style.cursor = "pointer";
            warnBanner.addEventListener("click", () => {
                openSettingsModal();
                const apiTabBtn = document.querySelector('.modal-tab-btn[data-tab="tabApi"]');
                if (apiTabBtn) apiTabBtn.click();
            });
        }

        // Personality Preset change
        if (elements.settingPersonality) {
            elements.settingPersonality.addEventListener("change", function () {
                if (elements.customPromptContainer) {
                    elements.customPromptContainer.style.display = this.value === "custom" ? "flex" : "none";
                }
            });
        }

        // Settings Tabs
        elements.modalTabBtns.forEach(btn => {
            btn.addEventListener("click", function () {
                const targetTab = this.getAttribute("data-tab");
                elements.modalTabBtns.forEach(b => b.classList.remove("active"));
                elements.tabPanes.forEach(p => p.style.display = "none");
                this.classList.add("active");
                const targetPane = document.getElementById(targetTab);
                if (targetPane) targetPane.style.display = "flex";
            });
        });

        // Password Change
        if (elements.updatePasswordBtn) {
            elements.updatePasswordBtn.addEventListener("click", handlePasswordChange);
        }

        // Rename Chat Modals
        if (elements.renameCurrentChatBtn) {
            elements.renameCurrentChatBtn.addEventListener("click", () => {
                if (currentChatId) openRenameModal(currentChatId, elements.currentChatTitle.textContent);
            });
        }
        if (elements.closeRenameBtn) elements.closeRenameBtn.addEventListener("click", closeRenameModal);
        if (elements.cancelRenameBtn) elements.cancelRenameBtn.addEventListener("click", closeRenameModal);
        if (elements.renameBackdrop) elements.renameBackdrop.addEventListener("click", closeRenameModal);
        if (elements.confirmRenameBtn) elements.confirmRenameBtn.addEventListener("click", confirmRenameChat);
    }

    // ================= Settings & Personalization ================= //

    const BACKGROUND_PRESETS = [
        { id: "dragon_throne", name: "🐉 Dragon Throne (Vhagar)" },
        { id: "dragon_sigil", name: "🔥 Fire Dragon Sigil (Targaryen)" },
        { id: "none", name: "🌑 Classic Dark" }
    ];

    async function fetchCurrentUserAndSettings() {
        try {
            const res = await fetch("/api/auth/me");
            if (res.ok) {
                const data = await res.json();
                userSettings = Object.assign(userSettings, data.settings || {});
                applyTheme(userSettings.theme || "dark");
                applyFontSize(userSettings.font_size || "normal");
                applyBackground(userSettings.background || "dragon_throne");
                
                if (elements.modelSelector && userSettings.preferred_model) {
                    elements.modelSelector.value = userSettings.preferred_model;
                }
            }
        } catch (e) {
            console.error("Error fetching user settings:", e);
        }
    }

    function cycleBackground() {
        const currentBg = document.body.getAttribute("data-bg") || "dragon_throne";
        const currentIndex = BACKGROUND_PRESETS.findIndex(b => b.id === currentBg);
        const nextIndex = (currentIndex + 1) % BACKGROUND_PRESETS.length;
        const nextBg = BACKGROUND_PRESETS[nextIndex];
        
        applyBackground(nextBg.id);
        userSettings.background = nextBg.id;
        updateSettingsRemote({ background: nextBg.id });
        showToast(`Theme Background: ${nextBg.name}`);
    }

    function applyBackground(bg) {
        document.body.setAttribute("data-bg", bg || "dragon_throne");
    }

    function toggleTheme() {
        const newTheme = document.body.classList.contains("dark-theme") ? "light" : "dark";
        applyTheme(newTheme);
        userSettings.theme = newTheme;
        updateSettingsRemote({ theme: newTheme });
    }

    function applyTheme(theme) {
        if (theme === "light") {
            document.body.classList.remove("dark-theme");
            document.body.classList.add("light-theme");
            const moonIcon = document.querySelector(".moon-icon");
            const sunIcon = document.querySelector(".sun-icon");
            if (moonIcon) moonIcon.style.display = "none";
            if (sunIcon) sunIcon.style.display = "block";
            
            const hljsTheme = document.getElementById("hljs-theme");
            if (hljsTheme) hljsTheme.href = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-light.min.css";
        } else {
            document.body.classList.remove("light-theme");
            document.body.classList.add("dark-theme");
            const moonIcon = document.querySelector(".moon-icon");
            const sunIcon = document.querySelector(".sun-icon");
            if (moonIcon) moonIcon.style.display = "block";
            if (sunIcon) sunIcon.style.display = "none";
            
            const hljsTheme = document.getElementById("hljs-theme");
            if (hljsTheme) hljsTheme.href = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css";
        }
    }

    function applyFontSize(size) {
        document.body.setAttribute("data-font", size);
    }

    function openSettingsModal() {
        // Populate inputs from userSettings
        elements.settingThemeRadios.forEach(radio => {
            radio.checked = radio.value === userSettings.theme;
        });
        if (elements.settingBackgroundRadios) {
            elements.settingBackgroundRadios.forEach(radio => {
                radio.checked = radio.value === (userSettings.background || "dragon_throne");
            });
        }
        if (elements.settingFontSize) elements.settingFontSize.value = userSettings.font_size || "normal";
        if (elements.settingLanguage) elements.settingLanguage.value = userSettings.language || "en";
        if (elements.settingPersonality) {
            elements.settingPersonality.value = userSettings.personality || "helpful";
            if (elements.customPromptContainer) {
                elements.customPromptContainer.style.display = userSettings.personality === "custom" ? "flex" : "none";
            }
        }
        if (elements.settingCustomPrompt) elements.settingCustomPrompt.value = userSettings.custom_system_prompt || "";
        if (elements.settingAutoSpeak) elements.settingAutoSpeak.checked = !!userSettings.auto_speak;
        if (elements.settingPreferredModel) elements.settingPreferredModel.value = userSettings.preferred_model || "qwen/qwen3.8-27b";

        elements.settingsModal.style.display = "flex";
    }

    function closeSettingsModal() {
        elements.settingsModal.style.display = "none";
    }

    async function saveSettingsFromModal() {
        let selectedTheme = "dark";
        elements.settingThemeRadios.forEach(r => { if (r.checked) selectedTheme = r.value; });
        
        let selectedBg = "dragon_throne";
        if (elements.settingBackgroundRadios) {
            elements.settingBackgroundRadios.forEach(r => { if (r.checked) selectedBg = r.value; });
        }

        const payload = {
            theme: selectedTheme,
            background: selectedBg,
            font_size: elements.settingFontSize.value,
            language: elements.settingLanguage.value,
            personality: elements.settingPersonality.value,
            custom_system_prompt: elements.settingCustomPrompt.value,
            auto_speak: elements.settingAutoSpeak.checked ? 1 : 0,
            preferred_model: elements.settingPreferredModel.value
        };

        userSettings = Object.assign(userSettings, payload);
        applyTheme(userSettings.theme);
        applyBackground(userSettings.background);
        applyFontSize(userSettings.font_size);
        if (elements.modelSelector) elements.modelSelector.value = userSettings.preferred_model;

        await updateSettingsRemote(payload);
        closeSettingsModal();
        showToast("Settings updated successfully!");
    }

    async function updateSettingsRemote(settings) {
        try {
            await fetch("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(settings)
            });
        } catch (e) {
            console.error("Failed to persist settings:", e);
        }
    }

    async function handlePasswordChange() {
        const oldPwd = elements.currentPasswordInput.value.trim();
        const newPwd = elements.newPasswordInput.value.trim();
        if (!oldPwd || !newPwd) {
            showToast("Please enter current and new passwords", true);
            return;
        }

        try {
            const res = await fetch("/api/profile/password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ current_password: oldPwd, new_password: newPwd })
            });
            const data = await res.json();
            if (res.ok) {
                showToast("Password changed successfully!");
                elements.currentPasswordInput.value = "";
                elements.newPasswordInput.value = "";
            } else {
                showToast(data.error || "Failed to update password", true);
            }
        } catch (err) {
            showToast("Network error updating password", true);
        }
    }

    // ================= Chat Management & History ================= //

    async function loadChatsList() {
        try {
            const res = await fetch("/api/chats");
            if (!res.ok) return;
            const data = await res.json();
            renderChatsList(data.chats || []);
        } catch (e) {
            console.error("Error loading chat history:", e);
        }
    }

    function renderChatsList(chats) {
        // Clear existing
        elements.chatsToday.innerHTML = "";
        elements.chatsYesterday.innerHTML = "";
        elements.chatsPrevious.innerHTML = "";
        elements.chatsOlder.innerHTML = "";

        if (chats.length === 0) {
            elements.emptyChatsMsg.style.display = "block";
            return;
        }
        elements.emptyChatsMsg.style.display = "none";

        const now = new Date();
        const oneDayMs = 24 * 60 * 60 * 1000;

        chats.forEach(chat => {
            const item = createChatItemElement(chat);
            const chatDate = new Date(chat.updated_at || chat.created_at);
            const diffDays = Math.floor((now - chatDate) / oneDayMs);

            if (diffDays === 0) {
                elements.chatsToday.appendChild(item);
            } else if (diffDays === 1) {
                elements.chatsYesterday.appendChild(item);
            } else if (diffDays <= 7) {
                elements.chatsPrevious.appendChild(item);
            } else {
                elements.chatsOlder.appendChild(item);
            }
        });

        // Hide empty groups
        document.querySelectorAll(".chat-group").forEach(group => {
            const list = group.querySelector(".chat-items-list");
            group.style.display = (list && list.children.length > 0) ? "block" : "none";
        });
    }

    function createChatItemElement(chat) {
        const item = document.createElement("div");
        item.className = `chat-item ${chat.id === currentChatId ? "active" : ""}`;
        item.setAttribute("data-chat-id", chat.id);

        const title = document.createElement("span");
        title.className = "chat-item-title";
        title.textContent = chat.title;
        title.title = chat.title;

        const actions = document.createElement("div");
        actions.className = "chat-item-actions";

        // Rename Button
        const renameBtn = document.createElement("button");
        renameBtn.className = "chat-action-btn";
        renameBtn.title = "Rename";
        renameBtn.innerHTML = `
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            </svg>
        `;
        renameBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            openRenameModal(chat.id, chat.title);
        });

        // Delete Button
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "chat-action-btn delete-btn";
        deleteBtn.title = "Delete";
        deleteBtn.innerHTML = `
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
        `;
        deleteBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            deleteChat(chat.id);
        });

        actions.appendChild(renameBtn);
        actions.appendChild(deleteBtn);

        item.appendChild(title);
        item.appendChild(actions);

        item.addEventListener("click", () => switchChat(chat.id));
        return item;
    }

    function filterChatsList() {
        const query = elements.searchChatInput.value.toLowerCase().trim();
        const items = document.querySelectorAll(".chat-item");
        let visibleCount = 0;
        items.forEach(item => {
            const title = item.querySelector(".chat-item-title").textContent.toLowerCase();
            if (title.includes(query)) {
                item.style.display = "flex";
                visibleCount++;
            } else {
                item.style.display = "none";
            }
        });

        elements.emptyChatsMsg.style.display = visibleCount === 0 ? "block" : "none";
    }

    async function startNewChat() {
        if (isStreaming) {
            showToast("Please wait for the current response to finish", true);
            return;
        }

        currentChatId = null;
        currentAttachments = [];
        renderAttachmentChips();

        elements.currentChatTitle.textContent = "New Conversation";
        elements.messagesList.innerHTML = "";
        elements.messagesList.style.display = "none";
        elements.welcomeHero.style.display = "flex";

        // Update active class in sidebar
        document.querySelectorAll(".chat-item").forEach(el => el.classList.remove("active"));
        
        if (window.innerWidth <= 768) {
            elements.sidebar.classList.remove("open");
        }

        elements.messageInput.focus();
    }

    async function switchChat(chatId) {
        if (isStreaming) {
            showToast("Please wait for the current response to finish", true);
            return;
        }

        try {
            const res = await fetch(`/api/chats/${chatId}`);
            if (!res.ok) {
                showToast("Failed to load conversation", true);
                return;
            }

            const data = await res.json();
            currentChatId = data.chat.id;
            elements.currentChatTitle.textContent = data.chat.title;

            // Highlight sidebar item
            document.querySelectorAll(".chat-item").forEach(el => {
                el.classList.toggle("active", parseInt(el.getAttribute("data-chat-id")) === currentChatId);
            });

            // Populate attachments
            currentAttachments = data.attachments || [];
            renderAttachmentChips();

            // Populate messages
            elements.messagesList.innerHTML = "";
            if (data.messages && data.messages.length > 0) {
                elements.welcomeHero.style.display = "none";
                elements.messagesList.style.display = "flex";
                data.messages.forEach(msg => appendMessageUI(msg.role, msg.content, msg.id));
                scrollToBottom();
            } else {
                elements.messagesList.style.display = "none";
                elements.welcomeHero.style.display = "flex";
            }

            if (window.innerWidth <= 768) {
                elements.sidebar.classList.remove("open");
            }

        } catch (e) {
            console.error("Error switching chat:", e);
        }
    }

    async function deleteChat(chatId) {
        if (!confirm("Are you sure you want to delete this conversation?")) return;

        try {
            const res = await fetch(`/api/chats/${chatId}`, { method: "DELETE" });
            if (res.ok) {
                showToast("Conversation deleted");
                if (currentChatId === chatId) {
                    startNewChat();
                }
                loadChatsList();
            } else {
                showToast("Failed to delete chat", true);
            }
        } catch (e) {
            showToast("Network error deleting chat", true);
        }
    }

    let renameTargetChatId = null;
    function openRenameModal(chatId, currentTitle) {
        renameTargetChatId = chatId;
        elements.renameChatInput.value = currentTitle;
        elements.renameModal.style.display = "flex";
        elements.renameChatInput.focus();
    }

    function closeRenameModal() {
        elements.renameModal.style.display = "none";
        renameTargetChatId = null;
    }

    async function confirmRenameChat() {
        const newTitle = elements.renameChatInput.value.trim();
        if (!newTitle || !renameTargetChatId) return;

        try {
            const res = await fetch(`/api/chats/${renameTargetChatId}/rename`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: newTitle })
            });

            if (res.ok) {
                if (currentChatId === renameTargetChatId) {
                    elements.currentChatTitle.textContent = newTitle;
                }
                loadChatsList();
                closeRenameModal();
                showToast("Conversation renamed");
            } else {
                showToast("Failed to rename conversation", true);
            }
        } catch (e) {
            showToast("Error renaming conversation", true);
        }
    }

    // ================= Sending Messages & SSE Streaming ================= //

    async function sendMessage() {
        const text = elements.messageInput.value.trim();
        if (!text || isStreaming) return;

        // Clear input and auto-resize
        elements.messageInput.value = "";
        elements.messageInput.style.height = "auto";

        // Show messages list, hide welcome hero
        elements.welcomeHero.style.display = "none";
        elements.messagesList.style.display = "flex";

        // Append user message immediately
        appendMessageUI("user", text);
        scrollToBottom();

        // If no current chat, create one
        if (!currentChatId) {
            try {
                const res = await fetch("/api/chats", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        title: text.length > 30 ? text.substring(0, 30) + "..." : text,
                        personality: userSettings.personality,
                        language: userSettings.language
                    })
                });
                const data = await res.json();
                currentChatId = data.chat_id;
                elements.currentChatTitle.textContent = data.title;
            } catch (err) {
                showToast("Error creating chat session", true);
                return;
            }
        }

        const usingImageMode = isImageMode;
        if (isImageMode) {
            isImageMode = false;
            if (elements.imageModeBtn) elements.imageModeBtn.classList.remove("active");
            elements.messageInput.placeholder = "Message Groq AI or toggle 🖼️ Image Mode... (Shift+Enter for new line)";
        }

        // Initiate AI stream
        await streamResponse(`/api/chats/${currentChatId}/message`, {
            content: text,
            model: elements.modelSelector.value,
            image_mode: usingImageMode
        });

        // Refresh chats list to update titles/ordering
        loadChatsList();
    }

    async function regenerateLastResponse() {
        if (!currentChatId || isStreaming) return;

        // Remove the last assistant message UI
        const lastMsg = elements.messagesList.querySelector(".message-row.ai-row:last-child");
        if (lastMsg) lastMsg.remove();

        await streamResponse(`/api/chats/${currentChatId}/regenerate`, {
            model: elements.modelSelector.value
        });
    }

    async function streamResponse(endpoint, payload) {
        isStreaming = true;
        setStreamingUI(true);

        // Append placeholder assistant message
        const { row, bubble, actionsBar } = createAssistantMessagePlaceholder();
        elements.messagesList.appendChild(row);
        scrollToBottom();

        let fullText = "";
        abortController = new AbortController();

        try {
            const response = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                signal: abortController.signal
            });

            if (!response.ok) {
                bubble.innerHTML = `<span style="color:#ef4444;">Server error: ${response.statusText}</span>`;
                isStreaming = false;
                setStreamingUI(false);
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n\n");
                buffer = lines.pop(); // keep last incomplete line

                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        const jsonStr = line.slice(6);
                        try {
                            const data = JSON.parse(jsonStr);
                            if (data.replace && data.content) {
                                fullText = data.content;
                                renderMarkdownContent(bubble, fullText);
                                scrollToBottom();
                            } else if (data.chunk) {
                                fullText += data.chunk;
                                renderMarkdownContent(bubble, fullText);
                                scrollToBottom();
                            }
                            if (data.done) {
                                break;
                            }
                        } catch (e) {
                            console.error("JSON parse error on SSE chunk:", e);
                        }
                    }
                }
            }

            // Final render to assure all markdown elements are parsed cleanly
            renderMarkdownContent(bubble, fullText);
            setupCodeCopyButtons(bubble);

            // Add action buttons (Copy, Speak, Regenerate)
            populateMessageActions(actionsBar, fullText);

            // If auto-speak is enabled, read it aloud!
            if (userSettings.auto_speak && fullText) {
                speakText(fullText);
            }

            // If voice mode is active, update voice transcript and speak aloud
            if (isVoiceModeActive && fullText) {
                handleVoiceModeAIResponse(fullText);
            }

        } catch (err) {
            if (err.name !== "AbortError") {
                bubble.innerHTML += `<p style="color:#ef4444;">Error connecting to Groq stream.</p>`;
            }
        } finally {
            isStreaming = false;
            setStreamingUI(false);
            abortController = null;
        }
    }

    function setStreamingUI(streaming) {
        const sendIcon = elements.sendBtn.querySelector(".send-icon");
        const spinnerIcon = elements.sendBtn.querySelector(".spinner-icon");
        if (streaming) {
            if (sendIcon) sendIcon.style.display = "none";
            if (spinnerIcon) spinnerIcon.style.display = "block";
        } else {
            if (sendIcon) sendIcon.style.display = "block";
            if (spinnerIcon) spinnerIcon.style.display = "none";
        }
    }

    // ================= Message Rendering & Markdown ================= //

    function appendMessageUI(role, content, messageId) {
        const row = document.createElement("div");
        row.className = `message-row ${role === "user" ? "user-row" : "ai-row"}`;

        const avatar = document.createElement("div");
        avatar.className = "msg-avatar";
        avatar.innerHTML = role === "user" 
            ? "U" 
            : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                 <circle cx="12" cy="12" r="10"></circle>
                 <path d="M12 6v6l4 2"></path>
                 <circle cx="12" cy="12" r="3" fill="currentColor"></circle>
               </svg>`;

        const bodyWrapper = document.createElement("div");
        bodyWrapper.className = "msg-body-wrapper";

        const bubble = document.createElement("div");
        bubble.className = "msg-bubble";

        if (role === "user") {
            bubble.textContent = content;
        } else {
            renderMarkdownContent(bubble, content);
            setupCodeCopyButtons(bubble);
        }

        bodyWrapper.appendChild(bubble);

        if (role === "assistant") {
            const actionsBar = document.createElement("div");
            actionsBar.className = "msg-actions";
            populateMessageActions(actionsBar, content);
            bodyWrapper.appendChild(actionsBar);
        }

        row.appendChild(avatar);
        row.appendChild(bodyWrapper);
        elements.messagesList.appendChild(row);
    }

    function createAssistantMessagePlaceholder() {
        const row = document.createElement("div");
        row.className = "message-row ai-row";

        const avatar = document.createElement("div");
        avatar.className = "msg-avatar";
        avatar.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M12 6v6l4 2"></path>
                <circle cx="12" cy="12" r="3" fill="currentColor"></circle>
            </svg>
        `;

        const bodyWrapper = document.createElement("div");
        bodyWrapper.className = "msg-body-wrapper";

        const bubble = document.createElement("div");
        bubble.className = "msg-bubble";
        bubble.innerHTML = '<span class="typing-indicator">● ● ●</span>';

        const actionsBar = document.createElement("div");
        actionsBar.className = "msg-actions";

        bodyWrapper.appendChild(bubble);
        bodyWrapper.appendChild(actionsBar);
        row.appendChild(avatar);
        row.appendChild(bodyWrapper);

        return { row, bubble, actionsBar };
    }

    function renderMarkdownContent(container, rawMarkdown) {
        if (typeof marked !== "undefined" && typeof DOMPurify !== "undefined") {
            const dirtyHtml = marked.parse(rawMarkdown);
            container.innerHTML = DOMPurify.sanitize(dirtyHtml);
        } else {
            container.textContent = rawMarkdown;
        }

        // Attach lightbox click listener to all rendered images
        container.querySelectorAll("img").forEach(img => {
            img.style.cursor = "zoom-in";
            img.title = "Click to view full image";
            img.addEventListener("click", () => openImageLightbox(img.src));
        });
    }

    function openImageLightbox(src) {
        if (!elements.imageLightbox) return;
        elements.lightboxImg.src = src;
        elements.lightboxDownloadBtn.href = src;
        elements.imageLightbox.style.display = "flex";
    }

    function closeImageLightbox() {
        if (!elements.imageLightbox) return;
        elements.imageLightbox.style.display = "none";
    }

    function setupCodeCopyButtons(container) {
        container.querySelectorAll("pre").forEach(pre => {
            if (pre.parentNode.classList.contains("code-block-wrapper")) return;

            const code = pre.querySelector("code");
            let language = "code";
            if (code) {
                const langClass = Array.from(code.classList).find(c => c.startsWith("language-"));
                if (langClass) language = langClass.replace("language-", "");
            }

            const wrapper = document.createElement("div");
            wrapper.className = "code-block-wrapper";

            const header = document.createElement("div");
            header.className = "code-header";
            header.innerHTML = `
                <span>${language}</span>
                <button class="code-copy-btn">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    <span>Copy Code</span>
                </button>
            `;

            const copyBtn = header.querySelector(".code-copy-btn");
            copyBtn.addEventListener("click", () => {
                const codeText = code ? code.innerText : pre.innerText;
                navigator.clipboard.writeText(codeText);
                copyBtn.innerHTML = `
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span style="color:#10b981;">Copied!</span>
                `;
                setTimeout(() => {
                    copyBtn.innerHTML = `
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                        <span>Copy Code</span>
                    `;
                }, 2000);
            });

            pre.parentNode.insertBefore(wrapper, pre);
            wrapper.appendChild(header);
            wrapper.appendChild(pre);
        });
    }

    function populateMessageActions(container, text) {
        container.innerHTML = "";

        // Copy Button
        const copyBtn = document.createElement("button");
        copyBtn.className = "msg-action-btn";
        copyBtn.innerHTML = `
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span>Copy</span>
        `;
        copyBtn.addEventListener("click", () => {
            navigator.clipboard.writeText(text);
            showToast("Copied to clipboard!");
        });

        // Read Aloud (TTS) Button
        const speakBtn = document.createElement("button");
        speakBtn.className = "msg-action-btn speak-btn";
        speakBtn.innerHTML = `
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            </svg>
            <span>Read Aloud</span>
        `;
        speakBtn.addEventListener("click", () => {
            if (speakBtn.classList.contains("active-speaking")) {
                stopSpeakingUtterance();
                speakBtn.classList.remove("active-speaking");
                speakBtn.querySelector("span").textContent = "Read Aloud";
            } else {
                document.querySelectorAll(".speak-btn").forEach(b => {
                    b.classList.remove("active-speaking");
                    b.querySelector("span").textContent = "Read Aloud";
                });
                speakBtn.classList.add("active-speaking");
                speakBtn.querySelector("span").textContent = "Stop";
                speakText(text, () => {
                    speakBtn.classList.remove("active-speaking");
                    speakBtn.querySelector("span").textContent = "Read Aloud";
                });
            }
        });

        // Regenerate Button
        const regenBtn = document.createElement("button");
        regenBtn.className = "msg-action-btn";
        regenBtn.innerHTML = `
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="1 4 1 10 7 10"></polyline>
                <polyline points="23 20 23 14 17 14"></polyline>
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path>
            </svg>
            <span>Regenerate</span>
        `;
        regenBtn.addEventListener("click", regenerateLastResponse);

        // Generate AI Image Illustration Button
        const imgBtn = document.createElement("button");
        imgBtn.className = "msg-action-btn img-action-btn";
        imgBtn.innerHTML = `
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
            </svg>
            <span>Image</span>
        `;
        imgBtn.title = "Generate an AI image illustrating this reply";
        imgBtn.addEventListener("click", async () => {
            showToast("🎨 Generating AI image illustration...");
            imgBtn.querySelector("span").textContent = "Drawing...";
            try {
                const res = await fetch("/api/generate-image", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        prompt: text.substring(0, 300),
                        chat_id: currentChatId
                    })
                });
                const data = await res.json();
                if (res.ok) {
                    appendMessageUI("assistant", data.markdown);
                    scrollToBottom();
                    showToast("AI Image generated successfully!");
                } else {
                    showToast(data.error || "Failed to generate image", true);
                }
            } catch (e) {
                showToast("Error generating image", true);
            } finally {
                imgBtn.querySelector("span").textContent = "Image";
            }
        });

        container.appendChild(copyBtn);
        container.appendChild(speakBtn);
        container.appendChild(regenBtn);
        container.appendChild(imgBtn);
    }

    function scrollToBottom() {
        elements.chatViewport.scrollTop = elements.chatViewport.scrollHeight;
    }

    // ================= File Upload & Attachments (PDF, DOCX, TXT, CSV) ================= //

    function setupDragAndDrop() {
        const overlay = elements.dragDropOverlay;
        let dragCounter = 0;

        window.addEventListener("dragenter", (e) => {
            e.preventDefault();
            dragCounter++;
            if (overlay) overlay.classList.add("active");
        });

        window.addEventListener("dragleave", (e) => {
            e.preventDefault();
            dragCounter--;
            if (dragCounter <= 0 && overlay) {
                overlay.classList.remove("active");
            }
        });

        window.addEventListener("dragover", (e) => e.preventDefault());

        window.addEventListener("drop", (e) => {
            e.preventDefault();
            dragCounter = 0;
            if (overlay) overlay.classList.remove("active");
            if (e.dataTransfer && e.dataTransfer.files.length > 0) {
                uploadSelectedFile(e.dataTransfer.files[0]);
            }
        });
    }

    function handleFileUpload(e) {
        if (e.target.files && e.target.files.length > 0) {
            uploadSelectedFile(e.target.files[0]);
            e.target.value = ""; // reset input
        }
    }

    async function uploadSelectedFile(file) {
        const validExtensions = [".pdf", ".docx", ".doc", ".txt", ".csv"];
        const fileName = file.name.toLowerCase();
        const isValid = validExtensions.some(ext => fileName.endsWith(ext));

        if (!isValid) {
            showToast("Invalid file format. Please upload PDF, DOCX, TXT, or CSV.", true);
            return;
        }

        showToast(`Extracting text from ${file.name}...`);

        const formData = new FormData();
        formData.append("file", file);
        if (currentChatId) formData.append("chat_id", currentChatId);

        try {
            const res = await fetch("/api/upload", {
                method: "POST",
                body: formData
            });
            const data = await res.json();

            if (res.ok) {
                if (!currentChatId) {
                    currentChatId = data.chat_id;
                    elements.currentChatTitle.textContent = `Document: ${file.name}`;
                    elements.welcomeHero.style.display = "none";
                    elements.messagesList.style.display = "flex";
                    loadChatsList();
                }

                currentAttachments.push(data.attachment);
                renderAttachmentChips();
                showToast(`Attached ${file.name} successfully!`);
                elements.messageInput.focus();
            } else {
                showToast(data.error || "Failed to process document", true);
            }
        } catch (err) {
            showToast("Error uploading file", true);
        }
    }

    function renderAttachmentChips() {
        if (!elements.attachmentsDrawer || !elements.attachmentChipsList) return;

        elements.attachmentChipsList.innerHTML = "";
        if (currentAttachments.length === 0) {
            elements.attachmentsDrawer.style.display = "none";
            return;
        }

        elements.attachmentsDrawer.style.display = "flex";
        currentAttachments.forEach(att => {
            const chip = document.createElement("div");
            chip.className = "attachment-chip";
            chip.innerHTML = `
                <span class="chip-ext">${att.file_type}</span>
                <span class="chip-name" title="${att.filename}">${att.filename}</span>
                <button class="chip-remove" title="Remove attachment">×</button>
            `;

            chip.querySelector(".chip-remove").addEventListener("click", async () => {
                try {
                    await fetch(`/api/attachments/${att.id}?chat_id=${currentChatId}`, { method: "DELETE" });
                    currentAttachments = currentAttachments.filter(a => a.id !== att.id);
                    renderAttachmentChips();
                    showToast("Attachment removed");
                } catch (e) {
                    showToast("Failed to remove attachment", true);
                }
            });

            elements.attachmentChipsList.appendChild(chip);
        });
    }

    // ================= Voice AI: Speech-To-Text & TTS ================= //

    function setupSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            speechRecognition = new SpeechRecognition();
            speechRecognition.continuous = false;
            speechRecognition.interimResults = true;
            speechRecognition.lang = getLanguageCode(userSettings.language || "en");

            speechRecognition.onresult = (event) => {
                let interim = "";
                let final = "";
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        final += event.results[i][0].transcript;
                    } else {
                        interim += event.results[i][0].transcript;
                    }
                }

                if (isVoiceModeActive) {
                    elements.voiceTranscriptContent.textContent = final || interim || "Listening...";
                    if (final) {
                        stopSpeechRecognition();
                        processVoiceModeInput(final);
                    }
                } else {
                    if (final) {
                        elements.messageInput.value = (elements.messageInput.value + " " + final).trim();
                        elements.messageInput.dispatchEvent(new Event("input"));
                    }
                }
            };

            speechRecognition.onerror = (e) => {
                console.warn("Speech recognition error:", e.error);
                stopSpeechRecognition();
            };

            speechRecognition.onend = () => {
                isSpeechRecognitionActive = false;
                if (elements.micBtn) elements.micBtn.classList.remove("recording");
                if (isVoiceModeActive && voiceModeListening) {
                    // In voice mode, keep waiting or cycle
                    elements.voiceOrb.classList.remove("listening");
                }
            };
        }
    }

    function getLanguageCode(lang) {
        const map = {
            en: "en-US", es: "es-ES", fr: "fr-FR", de: "de-DE",
            it: "it-IT", pt: "pt-BR", ru: "ru-RU", zh: "zh-CN",
            ja: "ja-JP", ko: "ko-KR", ar: "ar-SA", hi: "hi-IN",
            bn: "bn-IN", te: "te-IN", ta: "ta-IN"
        };
        return map[lang] || "en-US";
    }

    function toggleSpeechToText() {
        if (isSpeechRecognitionActive) {
            stopSpeechRecognition();
        } else {
            startSpeechRecognition();
        }
    }

    function startSpeechRecognition() {
        if (speechRecognition) {
            try {
                speechRecognition.lang = getLanguageCode(userSettings.language || "en");
                speechRecognition.start();
                isSpeechRecognitionActive = true;
                if (elements.micBtn) elements.micBtn.classList.add("recording");
                showToast("Listening... speak now");
            } catch (err) {
                console.error("Speech recognition start failed:", err);
            }
        } else {
            // Fallback to MediaRecorder & Groq Whisper API
            startMediaRecorderFallback();
        }
    }

    function stopSpeechRecognition() {
        if (speechRecognition && isSpeechRecognitionActive) {
            speechRecognition.stop();
            isSpeechRecognitionActive = false;
        }
        if (elements.micBtn) elements.micBtn.classList.remove("recording");
        if (mediaRecorder && mediaRecorder.state === "recording") {
            mediaRecorder.stop();
        }
    }

    async function startMediaRecorderFallback() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioChunks = [];
            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: "audio/wav" });
                const formData = new FormData();
                formData.append("audio", audioBlob, "mic_input.wav");
                showToast("Transcribing with Groq Whisper...");

                const res = await fetch("/api/voice/transcribe", { method: "POST", body: formData });
                const data = await res.json();
                if (res.ok && data.text) {
                    elements.messageInput.value = (elements.messageInput.value + " " + data.text).trim();
                    elements.messageInput.dispatchEvent(new Event("input"));
                    showToast("Transcription complete!");
                } else {
                    showToast(data.error || "Audio transcription failed", true);
                }
            };
            mediaRecorder.start();
            if (elements.micBtn) elements.micBtn.classList.add("recording");
            showToast("Recording audio (Groq Whisper)... click again to transcribe");
        } catch (e) {
            showToast("Microphone access denied or unavailable", true);
        }
    }

    // Text-to-Speech (TTS)
    function speakText(text, onEndCallback) {
        if (!("speechSynthesis" in window)) {
            showToast("Speech synthesis not supported in this browser", true);
            if (onEndCallback) onEndCallback();
            return;
        }

        stopSpeakingUtterance();

        // Clean text for speech (strip markdown headers, bold, code snippets)
        const cleanSpeech = text
            .replace(/```[\s\S]*?```/g, " code snippet omitted ")
            .replace(/`([^`]+)`/g, "$1")
            .replace(/[*#_~>]/g, "")
            .trim();

        if (!cleanSpeech) {
            if (onEndCallback) onEndCallback();
            return;
        }

        currentUtterance = new SpeechSynthesisUtterance(cleanSpeech);
        currentUtterance.lang = getLanguageCode(userSettings.language || "en");
        currentUtterance.rate = 1.05;

        currentUtterance.onend = () => {
            currentUtterance = null;
            if (onEndCallback) onEndCallback();
        };

        currentUtterance.onerror = () => {
            currentUtterance = null;
            if (onEndCallback) onEndCallback();
        };

        window.speechSynthesis.speak(currentUtterance);
    }

    function stopSpeakingUtterance() {
        if ("speechSynthesis" in window) {
            window.speechSynthesis.cancel();
        }
        currentUtterance = null;
        if (elements.voiceOrb) elements.voiceOrb.classList.remove("speaking");
    }

    // ================= Voice Conversation Mode (Full Screen) ================= //

    function openVoiceMode() {
        isVoiceModeActive = true;
        elements.voiceModal.style.display = "flex";
        elements.voiceStatusText.textContent = "Tap Start to Speak";
        elements.voiceTranscriptContent.textContent = "Speak naturally. Groq AI listens and replies automatically.";
        elements.voiceToggleListenText.textContent = "Start Listening";
    }

    function closeVoiceMode() {
        isVoiceModeActive = false;
        voiceModeListening = false;
        stopSpeechRecognition();
        stopSpeakingUtterance();
        elements.voiceModal.style.display = "none";
    }

    function toggleVoiceModeListening() {
        if (voiceModeListening) {
            voiceModeListening = false;
            stopSpeechRecognition();
            elements.voiceOrb.classList.remove("listening");
            elements.voiceStatusText.textContent = "Paused";
            elements.voiceToggleListenText.textContent = "Start Listening";
        } else {
            voiceModeListening = true;
            elements.voiceOrb.classList.add("listening");
            elements.voiceStatusText.textContent = "Listening...";
            elements.voiceToggleListenText.textContent = "Stop Listening";
            startSpeechRecognition();
        }
    }

    async function processVoiceModeInput(transcript) {
        elements.voiceOrb.classList.remove("listening");
        elements.voiceStatusText.textContent = "Groq is thinking...";
        elements.voiceTranscriptContent.textContent = `You: "${transcript}"`;

        // Send message in the background chat
        if (!currentChatId) {
            try {
                const res = await fetch("/api/chats", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        title: `Voice: ${transcript.substring(0, 25)}`,
                        personality: userSettings.personality,
                        language: userSettings.language
                    })
                });
                const d = await res.json();
                currentChatId = d.chat_id;
                elements.currentChatTitle.textContent = d.title;
            } catch (e) {}
        }

        // Send query to Groq
        elements.messageInput.value = transcript;
        sendMessage();
    }

    function handleVoiceModeAIResponse(aiText) {
        elements.voiceStatusText.textContent = "Groq is speaking...";
        elements.voiceTranscriptContent.textContent = `Groq: ${aiText.substring(0, 180)}...`;
        elements.voiceOrb.classList.add("speaking");

        speakText(aiText, () => {
            elements.voiceOrb.classList.remove("speaking");
            if (voiceModeListening && isVoiceModeActive) {
                elements.voiceStatusText.textContent = "Listening...";
                elements.voiceOrb.classList.add("listening");
                startSpeechRecognition();
            } else {
                elements.voiceStatusText.textContent = "Ready";
            }
        });
    }

    // ================= Toast Notifications ================= //

    function showToast(message, isError = false) {
        if (!elements.toastContainer) return;

        const toast = document.createElement("div");
        toast.className = `toast ${isError ? "toast-error" : ""}`;
        toast.innerHTML = `
            <span>${isError ? "⚠️" : "✨"}</span>
            <span>${message}</span>
        `;
        elements.toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = "0";
            toast.style.transform = "translateY(10px)";
            toast.style.transition = "all 0.3s ease";
            setTimeout(() => toast.remove(), 300);
        }, 3200);
    }

    // Initialize on DOMContentLoaded
    document.addEventListener("DOMContentLoaded", init);

})();
