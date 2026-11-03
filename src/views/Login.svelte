<script>
    import { onMount, onDestroy } from "svelte";
    import { navigate } from "svelte-routing";
    import CryptoJS from "crypto-js";
    import api from "../lib/apis";
    import { secureStorage } from "../lib/secureStore";
    import { authStore } from "../stores/auth";
    import { tenantStore } from "../stores/tenant";
    import { clearOpeningStore } from "../stores/openingStore";
    import Swal from "sweetalert2";

    // Props
    export let idcl = "";

    // Leer el tenantStore reactivamente
    $: tenantValue = $tenantStore;

    let prevTenant = "";
    $: if (tenantValue && tenantValue !== prevTenant) {
        prevTenant = tenantValue;
        fetchData();
    }

    // -------------------------------------------------------
    // SANITIZACIÓN — protección contra SQLi / XSS en cliente
    // -------------------------------------------------------
    /**
     * Elimina caracteres peligrosos para SQL y XSS.
     * El backend DEBE usar prepared statements, pero esta capa
     * evita enviar payloads obvios y limita la superficie de ataque.
     */
    function sanitizeInput(value = "") {
        return value
            .trim()
            // Eliminar caracteres de control y nulos
            .replace(/[\x00-\x1F\x7F]/g, "")
            // Eliminar secuencias SQL clásicas
            .replace(/(['";\\]|--|\bOR\b|\bAND\b|\bUNION\b|\bSELECT\b|\bDROP\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bEXEC\b|\bXP_\b)/gi, "")
            // Eliminar etiquetas HTML/script
            .replace(/<[^>]*>/g, "");
    }

    /** Valida que username solo contenga caracteres alfanuméricos, puntos, guiones y arroba */
    function isValidUsername(value = "") {
        return /^[a-zA-Z0-9._@\-]{1,50}$/.test(value);
    }

    // Variables de estado del formulario de login
    let username = "";
    let password = "";
    let showPassword = false;

    // Pasos: "login" (acceso directo usuario/clave), "forgotUser", "forgotCode", "forgotReset"
    let currentStep = "login";

    // Variables para el flujo de recuperación de contraseña
    let forgotUsername = "";
    let forgotEmail = "";
    let generatedCode = "";
    let enteredCode = "";
    let otpDigits = ["", "", "", "", "", ""];
    let otpInputs = [];
    let newPassword = "";
    let confirmPassword = "";
    let showNewPassword = false;
    let userId = null;
    let resetLoginType = ""; // "user" o "course"

    // Countdown para expiración del código OTP (3 min)
    let otpSecondsLeft = 0;
    let otpCountdownInterval = null;

    let errorMessage = "";
    let loading = false;

    // Logo y configuración de la compañía
    let companyImage = "/login_logo_GRL_999.png";
    let imageLoaded = false;
    let imageError = false;
    let code_company = "";
    let schema_name = "salesvisit";
    let companyName = "ClientHub";
    let company = 0;

    const IMAGE_BASE = import.meta.env.VITE_FRURL || "";
    const HASH_KEY = "749d50a656fb9";

    // Carga de datos de la compañía según el subdominio / tenant
    async function fetchData() {
        imageLoaded = false;
        imageError = false;

        const rawValue = idcl || tenantValue || "";
        console.debug("[Login] fetchData rawValue:", rawValue);

        if (!rawValue) {
            console.warn("[Login] subdominio vacío, usando defaults");
            companyImage = "/login_logo_GRL_999.png";
            return;
        }

        try {
            const respComp = await api.getData(
                "company",
                "",
                `subdominio=${rawValue}`,
                "",
                "salesvisit",
            );
            console.debug("[Login] respComp:", respComp);
            console.log("status :", respComp.status);

            if (respComp.status === "success" && respComp.data?.length > 0) {
                const companyTemp = respComp.data[0];
                code_company = companyTemp.identificador || "";
                schema_name = companyTemp.schema_name || "salesvisit";
                companyName =
                    companyTemp.razon_social ||
                    companyTemp.nombre ||
                    "ClientHub";
                secureStorage.setItem("codecompany", companyTemp.identificador);
                console.log("identificador :", code_company);
            } else {
                console.warn(
                    "[Login] No se encontró la compañía:",
                    respComp.message,
                );
                code_company = "";
            }

            if (code_company) {
                companyImage = IMAGE_BASE
                    ? `${IMAGE_BASE}/login_logo_${code_company}.png`
                    : `/login_logo_${code_company}.png`;
            } else {
                companyImage = "/login_logo_GRL_999.png";
            }
        } catch (err) {
            console.warn("Error al cargar datos de empresa:", err);
            companyImage = "/login_logo_GRL_999.png";
        }
    }

    onMount(() => {
        // Limpiar sesión previa
        secureStorage.removeItem("_tk_");
        secureStorage.removeItem("_us_");
        clearOpeningStore();

        // Solo llamamos fetchData si tenantValue no lo disparó reactivamente
        if (!tenantValue) {
            fetchData();
        }
    });

    onDestroy(() => {
        if (otpCountdownInterval) clearInterval(otpCountdownInterval);
    });

    function handleImageError() {
        imageError = true;
        // Fallback a imagen general de hero si no encuentra el logo específico
        companyImage = "/hero.png";
    }

    // Acción para autofocus accesible
    function focus(node) {
        node.focus();
    }

    // -------------------------------------------------------------
    // LOGIN PRINCIPAL (USUARIO Y CONTRASEÑA)
    // -------------------------------------------------------------
    async function handleLogin() {
        if (!username || !username.trim()) {
            errorMessage = "Por favor ingresa tu usuario.";
            return;
        }
        if (!password) {
            errorMessage = "Por favor ingresa tu contraseña.";
            return;
        }

        // --- Sanitización y validación ---
        const cleanUser = sanitizeInput(username);
        if (!isValidUsername(cleanUser)) {
            errorMessage = "El usuario contiene caracteres no permitidos.";
            return;
        }
        if (password.length > 100) {
            errorMessage = "La contraseña excede el largo máximo permitido.";
            return;
        }

        loading = true;
        errorMessage = "";
        console.log("code company :", code_company);

        try {
            const currentSchema = schema_name || "salesvisit";

            // Hashing HMAC-MD5 con clave secreta para usuarios del sistema
            const hashedPassword = CryptoJS.HmacMD5(
                password,
                HASH_KEY,
            ).toString();

            const payload = {
                login_type: "user",
                username: cleanUser,
                password: hashedPassword,
            };

            const tokenResponse = await api.setData(
                "login",
                payload,
                "",
                "",
                currentSchema,
            );

            console.log("[Login] tokenResponse:", tokenResponse);

            if (tokenResponse.status === "success" && tokenResponse.data) {
                const resData = tokenResponse.data?.data || tokenResponse.data;
                const authToken = resData.token || "";

                if (!authToken) {
                    errorMessage =
                        tokenResponse.message ||
                        "No se pudo obtener el token de autenticación. Verifica tus credenciales.";
                    return;
                }

                // Guardar token en secureStorage
                await secureStorage.setItem("_tk_", authToken);

                // Volver a consultar el usuario usando username y password con el token incluido
                const queryParams = `active=1&username=${encodeURIComponent(cleanUser)}&password_hash=${encodeURIComponent(hashedPassword)}`;
                let userResponse = await api.getData(
                    "users",
                    "",
                    queryParams,
                    "",
                    currentSchema,
                    authToken,
                );

                console.log("[Login] userResponse:", userResponse);

                let rawUser = null;
                if (
                    userResponse.status === "success" &&
                    userResponse.data &&
                    (Array.isArray(userResponse.data)
                        ? userResponse.data.length > 0
                        : true)
                ) {
                    rawUser = Array.isArray(userResponse.data)
                        ? userResponse.data[0]
                        : userResponse.data;
                } else {
                    // Fallback sin el filtro active=1
                    const fallbackParams = `username=${encodeURIComponent(cleanUser)}&password_hash=${encodeURIComponent(hashedPassword)}`;
                    const fallbackResp = await api.getData(
                        "users",
                        "",
                        fallbackParams,
                        "",
                        currentSchema,
                        authToken,
                    );
                    if (
                        fallbackResp.status === "success" &&
                        fallbackResp.data &&
                        (Array.isArray(fallbackResp.data)
                            ? fallbackResp.data.length > 0
                            : true)
                    ) {
                        rawUser = Array.isArray(fallbackResp.data)
                            ? fallbackResp.data[0]
                            : fallbackResp.data;
                    }
                }
                console.log("rawUser", rawUser);
                if (rawUser) {
                    const userData = {
                        id: rawUser.id,
                        name: rawUser.name || rawUser.username || cleanUser,
                        username: rawUser.username || cleanUser,
                        position: rawUser.rol?.description || "Usuario",
                        company: rawUser.company_id,
                        schema: currentSchema,
                        rol_id: rawUser.roles_id,
                        codecompany: code_company,
                        permissions:
                            typeof rawUser.rol?.permissions === "string"
                                ? JSON.parse(rawUser.rol.permissions)
                                : rawUser.rol?.permissions ||
                                  rawUser.permissions ||
                                  {},
                    };

                    await secureStorage.setItem("_us_", userData);

                    // Actualizar store reactivo de autenticación
                    authStore.set({
                        isAuthenticated: true,
                        user: userData,
                        token: authToken,
                    });

                    // Redireccionar al panel principal
                    navigate("/admin/index");
                } else {
                    errorMessage =
                        userResponse.message ||
                        "No se pudo obtener la información del usuario. Por favor intenta de nuevo.";
                }
            } else {
                errorMessage =
                    tokenResponse.message ||
                    "Usuario o contraseña incorrectos. Por favor intenta de nuevo.";
            }
        } catch (error) {
            console.error("Login error:", error);
            errorMessage =
                "Ocurrió un error al intentar iniciar sesión. Revisa tu conexión.";
        } finally {
            loading = false;
        }
    }

    // -------------------------------------------------------------
    // RECUPERACIÓN DE CLAVE (OLVIDÉ MI CLAVE)
    // -------------------------------------------------------------
    function resetSteps() {
        currentStep = "login";
        errorMessage = "";
        forgotUsername = "";
        forgotEmail = "";
        generatedCode = "";
        enteredCode = "";
        otpDigits = ["", "", "", "", "", ""];
        newPassword = "";
        confirmPassword = "";
        userId = null;
        resetLoginType = "";
        if (otpCountdownInterval) clearInterval(otpCountdownInterval);
        otpSecondsLeft = 0;
    }

    // Paso 1: Enviar código al usuario
    async function handleForgotUser() {
        if (!forgotUsername || !forgotUsername.trim()) {
            errorMessage = "Por favor ingresa tu usuario o rut.";
            return;
        }

        // --- Sanitización y validación ---
        const cleanUser = sanitizeInput(forgotUsername);
        if (!cleanUser) {
            errorMessage = "El usuario contiene caracteres no permitidos.";
            return;
        }

        errorMessage = "";
        loading = true;

        try {
            const schema = schema_name || "salesvisit";

            // 1. Validar en tabla 'users'
            const userPayload = {
                login_type: "user",
                username: cleanUser,
            };
            const userResp = await api.setData(
                "restore",
                userPayload,
                "",
                "",
                schema,
            );

            if (userResp.status === "success" && userResp.data?.id) {
                userId = Number(userResp.data.id);
                forgotEmail = userResp.data.email || "";
                resetLoginType = userResp.data.type || "user";
                if (userResp.data.token) {
                    await secureStorage.setItem("_tk_", userResp.data.token);
                }
            } else {
                // 2. Si no es usuario, validar en tabla 'curso'
                const cursoPayload = {
                    login_type: "course",
                    rutapod: cleanUser.toUpperCase(),
                };
                const cursoResp = await api.setData(
                    "restore",
                    cursoPayload,
                    "",
                    "",
                    schema,
                );

                if (cursoResp.status === "success" && cursoResp.data?.id) {
                    userId = Number(cursoResp.data.id);
                    forgotEmail = cursoResp.data.email || "";
                    resetLoginType = cursoResp.data.type || "course";
                    if (cursoResp.data.token) {
                        await secureStorage.setItem(
                            "_tk_",
                            cursoResp.data.token,
                        );
                    }
                } else {
                    errorMessage = "Usuario o rut no encontrado en el sistema.";
                    loading = false;
                    return;
                }
            }

            // 3. Generar código de 6 dígitos con expiración de 3 minutos
            generatedCode = String(Math.floor(100000 + Math.random() * 900000));
            const expiresAt = Date.now() + 3 * 60 * 1000;
            await secureStorage.setItem("_reset_code_", generatedCode);
            await secureStorage.setItem("_reset_code_exp_", String(expiresAt));

            // 4. Enviar código por servicio
            const emailPayload = {
                email: forgotEmail,
                code: generatedCode,
            };
            try {
                await api.setData("send-code", emailPayload, "", "", schema);
            } catch (errMail) {
                console.warn("send-code no configurado o falló:", errMail);
            }

            const maskedEmail =
                forgotEmail && forgotEmail.includes("@")
                    ? forgotEmail.replace(/(.{2})(.*)(@.*)/, "$1****$3")
                    : "tu correo registrado";

            Swal.fire({
                icon: "info",
                title: "Código generado",
                text: `Se ha enviado un código de 6 dígitos a ${maskedEmail}. Tienes 3 minutos para ingresarlo.`,
                confirmButtonColor: "#2563eb",
            });

            otpDigits = ["", "", "", "", "", ""];
            currentStep = "forgotCode";

            // Iniciar cuenta regresiva de 3 minutos
            if (otpCountdownInterval) clearInterval(otpCountdownInterval);
            otpSecondsLeft = 3 * 60;
            otpCountdownInterval = setInterval(() => {
                otpSecondsLeft -= 1;
                if (otpSecondsLeft <= 0) {
                    clearInterval(otpCountdownInterval);
                    otpSecondsLeft = 0;
                }
            }, 1000);

            setTimeout(() => {
                otpInputs[0]?.focus();
            }, 150);
        } catch (e) {
            console.error(e);
            errorMessage = "Error al solicitar el código de recuperación.";
        } finally {
            loading = false;
        }
    }

    // Manejo de inputs del OTP
    function handleOtpInput(event, index) {
        const value = event.target.value;
        const digit = value.replace(/\D/g, "").slice(-1);
        otpDigits[index] = digit;
        otpDigits = [...otpDigits];

        if (digit && index < 5) {
            otpInputs[index + 1]?.focus();
        }
    }

    function handleOtpKeyDown(event, index) {
        if (event.key === "Backspace") {
            if (!otpDigits[index] && index > 0) {
                otpInputs[index - 1]?.focus();
                otpDigits[index - 1] = "";
                otpDigits = [...otpDigits];
                event.preventDefault();
            } else {
                otpDigits[index] = "";
                otpDigits = [...otpDigits];
            }
        } else if (event.key === "ArrowLeft" && index > 0) {
            otpInputs[index - 1]?.focus();
        } else if (event.key === "ArrowRight" && index < 5) {
            otpInputs[index + 1]?.focus();
        }
    }

    function handleOtpPaste(event) {
        event.preventDefault();
        const pasteData = event.clipboardData?.getData("text") || "";
        const digitsOnly = pasteData.replace(/\D/g, "").slice(0, 6);
        if (!digitsOnly) return;

        for (let i = 0; i < 6; i++) {
            otpDigits[i] = digitsOnly[i] || "";
        }
        otpDigits = [...otpDigits];

        const targetIndex = Math.min(digitsOnly.length, 5);
        otpInputs[targetIndex]?.focus();
    }

    // Paso 2: Verificar código OTP de 6 caracteres
    async function handleVerifyCode() {
        enteredCode = otpDigits.join("").trim();
        if (!enteredCode || enteredCode.length < 6) {
            errorMessage = "Ingresa el código completo de 6 dígitos.";
            return;
        }

        const expStored = await secureStorage.getItem("_reset_code_exp_");
        if (!expStored || Date.now() > Number(expStored)) {
            await secureStorage.removeItem("_reset_code_");
            await secureStorage.removeItem("_reset_code_exp_");
            if (otpCountdownInterval) clearInterval(otpCountdownInterval);
            otpSecondsLeft = 0;
            errorMessage =
                "El código ha expirado. Por favor solicita uno nuevo.";
            return;
        }

        const storedCode = await secureStorage.getItem("_reset_code_");
        if (storedCode && enteredCode === String(storedCode).trim()) {
            await secureStorage.removeItem("_reset_code_");
            await secureStorage.removeItem("_reset_code_exp_");
            if (otpCountdownInterval) clearInterval(otpCountdownInterval);
            currentStep = "forgotReset";
            errorMessage = "";
        } else {
            errorMessage = "El código ingresado es incorrecto.";
        }
    }

    // Paso 3: Restablecer contraseña
    async function handleResetPassword() {
        if (!newPassword) {
            errorMessage = "Ingresa tu nueva contraseña.";
            return;
        }
        if (newPassword.length < 4) {
            errorMessage = "La contraseña debe tener al menos 4 caracteres.";
            return;
        }
        if (newPassword !== confirmPassword) {
            errorMessage = "Las contraseñas no coinciden.";
            return;
        }

        loading = true;
        errorMessage = "";

        try {
            const schema = schema_name || "salesvisit";
            let updateResult = null;

            if (resetLoginType === "user") {
                const hashedPassword = CryptoJS.HmacMD5(
                    newPassword,
                    HASH_KEY,
                ).toString();
                updateResult = await api.updateData(
                    "users",
                    { password: hashedPassword },
                    "",
                    userId,
                    schema,
                );
            } else if (resetLoginType === "course") {
                const hashedApoPass = CryptoJS.MD5(newPassword).toString();
                updateResult = await api.updateData(
                    "curso",
                    { password: hashedApoPass },
                    "",
                    userId,
                    schema,
                );
            } else {
                errorMessage = "No se pudo determinar el tipo de cuenta.";
                loading = false;
                return;
            }

            if (updateResult && updateResult.status === "success") {
                await secureStorage.removeItem("_tk_");
                await secureStorage.removeItem("_reset_code_");

                resetSteps();

                await Swal.fire({
                    icon: "success",
                    title: "¡Contraseña actualizada!",
                    text: "Tu contraseña se ha cambiado exitosamente. Ya puedes iniciar sesión.",
                    confirmButtonColor: "#2563eb",
                });
            } else {
                errorMessage =
                    updateResult?.message ||
                    "No se pudo actualizar la contraseña.";
            }
        } catch (e) {
            console.error(e);
            errorMessage = "Error al actualizar la contraseña.";
        } finally {
            loading = false;
        }
    }
</script>

<div class="login-wrapper">
    <!-- PANEL IZQUIERDO: ILUSTRACIÓN / LOGO / BRANDING -->
    <div class="brand-panel">
        <div class="brand-glow"></div>
        <div class="brand-content">
            <div class="logo-box {imageLoaded ? 'is-loaded' : ''}">
                <img
                    src={companyImage}
                    alt={companyName}
                    class="company-logo"
                    on:load={() => (imageLoaded = true)}
                    on:error={handleImageError}
                />
            </div>
            <div class="brand-text">
                <span class="badge-brand">Portal Corporativo</span>
                <h2 class="brand-title">{companyName}</h2>
                <p class="brand-subtitle">
                    Gestiona tus operaciones, usuarios y servicios en una
                    plataforma unificada y segura.
                </p>
            </div>
        </div>
        <div class="brand-footer">
            <small
                >© {new Date().getFullYear()} ClientHub. Todos los derechos reservados.</small
            >
        </div>
    </div>

    <!-- PANEL DERECHO: FORMULARIOS -->
    <div class="form-panel">
        <div class="card-login">
            <!-- Encabezado del Formulario -->
            <div class="header-box">
                {#if currentStep === "login"}
                    <h1 class="title">Iniciar Sesión</h1>
                    <p class="subtitle">
                        Ingresa tus credenciales para acceder al sistema
                    </p>
                {:else if currentStep === "forgotUser"}
                    <h1 class="title">Recuperar Clave</h1>
                    <p class="subtitle">
                        Ingresa tu usuario o RUT para enviarte un código
                    </p>
                {:else if currentStep === "forgotCode"}
                    <h1 class="title">Verificación de Código</h1>
                    <p class="subtitle">
                        Ingresa el código de 6 caracteres que enviamos a tu
                        correo
                    </p>
                {:else if currentStep === "forgotReset"}
                    <h1 class="title">Nueva Contraseña</h1>
                    <p class="subtitle">
                        Crea una nueva contraseña para tu cuenta
                    </p>
                {/if}
            </div>

            <!-- Alerta de Error -->
            {#if errorMessage}
                <div class="alert-error" role="alert">
                    <i class="bi bi-exclamation-circle-fill"></i>
                    <span>{errorMessage}</span>
                </div>
            {/if}

            <!-- 1. PASO LOGIN: ACCESO DIRECTO USUARIO Y CLAVE -->
            {#if currentStep === "login"}
                <form on:submit|preventDefault={handleLogin} class="form-body">
                    <!-- Input Usuario -->
                    <div class="form-group">
                        <label for="username" class="input-label">Usuario</label
                        >
                        <div class="input-wrapper">
                            <span class="input-icon">
                                <i class="fa fa-user"></i>
                            </span>
                            <input
                                type="text"
                                class="custom-input"
                                id="username"
                                name="username"
                                bind:value={username}
                                placeholder="Ingresa tu usuario"
                                required
                                maxlength="50"
                                autocomplete="username"
                                use:focus
                            />
                        </div>
                    </div>

                    <!-- Input Clave -->
                    <div class="form-group">
                        <div
                            class="d-flex justify-content-between align-items-center mb-1"
                        >
                            <label for="password" class="input-label mb-0"
                                >Contraseña</label
                            >
                            <button
                                type="button"
                                class="link-forgot"
                                on:click={() => (currentStep = "forgotUser")}
                            >
                                ¿Olvidaste tu clave?
                            </button>
                        </div>
                        <div class="input-wrapper">
                            <span class="input-icon">
                                <i class="fa fa-lock"></i>
                            </span>
                            <input
                                type={showPassword ? "text" : "password"}
                                class="custom-input"
                                id="password"
                                name="password"
                                bind:value={password}
                                placeholder="Ingresa tu clave"
                                required
                                autocomplete="current-password"
                            />
                            <button
                                type="button"
                                class="btn-toggle-eye"
                                on:click={() => (showPassword = !showPassword)}
                                aria-label="Mostrar u ocultar contraseña"
                            >
                                <i
                                    class="bi {showPassword
                                        ? 'bi-eye-slash'
                                        : 'bi-eye'}"
                                ></i>
                            </button>
                        </div>
                    </div>

                    <!-- Botón Ingresar -->
                    <div class="form-actions">
                        <button
                            type="submit"
                            class="btn-primary-custom"
                            disabled={loading}
                        >
                            {#if loading}
                                <span
                                    class="spinner-border spinner-border-sm me-2"
                                    role="status"
                                ></span>
                                Ingresando...
                            {:else}
                                <span>Ingresar</span>
                                <i class="bi bi-arrow-right ms-2"></i>
                            {/if}
                        </button>
                    </div>
                </form>
            {/if}

            <!-- 2. PASO FORGOT USER: SOLICITAR USUARIO/RUT -->
            {#if currentStep === "forgotUser"}
                <form
                    on:submit|preventDefault={handleForgotUser}
                    class="form-body"
                >
                    <div class="form-group">
                        <label for="forgotUser" class="input-label"
                            >Usuario o RUT</label
                        >
                        <div class="input-wrapper">
                            <span class="input-icon">
                                <i class="fa fa-user"></i>
                            </span>
                            <input
                                type="text"
                                class="custom-input"
                                id="forgotUser"
                                name="forgotUser"
                                bind:value={forgotUsername}
                                placeholder="Ej: 12345678-9 o usuario"
                                required
                                use:focus
                            />
                        </div>
                    </div>

                    <div class="form-actions">
                        <button
                            type="submit"
                            class="btn-primary-custom"
                            disabled={loading}
                        >
                            {#if loading}
                                <span
                                    class="spinner-border spinner-border-sm me-2"
                                    role="status"
                                ></span>
                                Enviando código...
                            {:else}
                                <span>Enviar Código</span>
                                <i class="bi bi-send ms-2"></i>
                            {/if}
                        </button>

                        <button
                            type="button"
                            class="btn-back"
                            on:click={resetSteps}
                        >
                            <i class="bi bi-arrow-left me-1"></i> Volver al Login
                        </button>
                    </div>
                </form>
            {/if}

            <!-- 3. PASO FORGOT CODE: CÓDIGO DE 6 DÍGITOS -->
            {#if currentStep === "forgotCode"}
                <form
                    on:submit|preventDefault={handleVerifyCode}
                    class="form-body"
                >
                    <div class="form-group text-center">
                        <label for="otp-0" class="input-label mb-2"
                            >Código de 6 dígitos</label
                        >
                        <div class="otp-grid" on:paste={handleOtpPaste}>
                            {#each otpDigits as digit, i}
                                <input
                                    id={"otp-" + i}
                                    type="text"
                                    inputmode="numeric"
                                    pattern="[0-9]*"
                                    maxlength="1"
                                    class="otp-cell"
                                    bind:this={otpInputs[i]}
                                    value={digit}
                                    on:input={(e) => handleOtpInput(e, i)}
                                    on:keydown={(e) => handleOtpKeyDown(e, i)}
                                    autocomplete="one-time-code"
                                />
                            {/each}
                        </div>

                        <!-- Timer regresivo -->
                        <div class="otp-timer-box">
                            {#if otpSecondsLeft > 0}
                                <span
                                    class="timer-badge {otpSecondsLeft < 60
                                        ? 'timer-urgent'
                                        : ''}"
                                >
                                    <i class="bi bi-clock me-1"></i>
                                    Expira en {String(
                                        Math.floor(otpSecondsLeft / 60),
                                    ).padStart(2, "0")}:{String(
                                        otpSecondsLeft % 60,
                                    ).padStart(2, "0")}
                                </span>
                            {:else}
                                <span class="timer-badge timer-expired">
                                    <i class="bi bi-x-circle me-1"></i>
                                    Código expirado
                                </span>
                            {/if}
                        </div>
                    </div>

                    <div class="form-actions">
                        {#if otpSecondsLeft > 0}
                            <button
                                type="submit"
                                class="btn-primary-custom"
                                disabled={loading}
                            >
                                <span>Verificar Código</span>
                                <i class="bi bi-check-lg ms-2"></i>
                            </button>
                        {:else}
                            <button
                                type="button"
                                class="btn-secondary-custom"
                                on:click={handleForgotUser}
                            >
                                <i class="bi bi-arrow-clockwise me-2"></i> Solicitar
                                nuevo código
                            </button>
                        {/if}

                        <button
                            type="button"
                            class="btn-back"
                            on:click={resetSteps}
                        >
                            <i class="bi bi-arrow-left me-1"></i> Cancelar
                        </button>
                    </div>
                </form>
            {/if}

            <!-- 4. PASO FORGOT RESET: NUEVA CLAVE -->
            {#if currentStep === "forgotReset"}
                <form
                    on:submit|preventDefault={handleResetPassword}
                    class="form-body"
                >
                    <div class="form-group">
                        <label for="newPassword" class="input-label"
                            >Nueva Contraseña</label
                        >
                        <div class="input-wrapper">
                            <span class="input-icon">
                                <i class="fa fa-lock"></i>
                            </span>
                            <input
                                type={showNewPassword ? "text" : "password"}
                                class="custom-input"
                                id="newPassword"
                                name="newPassword"
                                bind:value={newPassword}
                                placeholder="Al menos 4 caracteres"
                                required
                                use:focus
                            />
                            <button
                                type="button"
                                class="btn-toggle-eye"
                                on:click={() =>
                                    (showNewPassword = !showNewPassword)}
                                aria-label="Mostrar u ocultar contraseña"
                            >
                                <i
                                    class="bi {showNewPassword
                                        ? 'bi-eye-slash'
                                        : 'bi-eye'}"
                                ></i>
                            </button>
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="confirmPassword" class="input-label"
                            >Confirmar Contraseña</label
                        >
                        <div class="input-wrapper">
                            <span class="input-icon">
                                <i class="fa fa-lock"></i>
                            </span>
                            <input
                                type={showNewPassword ? "text" : "password"}
                                class="custom-input"
                                id="confirmPassword"
                                name="confirmPassword"
                                bind:value={confirmPassword}
                                placeholder="Repite tu nueva contraseña"
                                required
                            />
                        </div>
                    </div>

                    <div class="form-actions">
                        <button
                            type="submit"
                            class="btn-success-custom"
                            disabled={loading}
                        >
                            {#if loading}
                                <span
                                    class="spinner-border spinner-border-sm me-2"
                                    role="status"
                                ></span>
                                Guardando...
                            {:else}
                                <span>Cambiar Contraseña</span>
                                <i class="bi bi-shield-lock ms-2"></i>
                            {/if}
                        </button>

                        <button
                            type="button"
                            class="btn-back"
                            on:click={resetSteps}
                        >
                            <i class="bi bi-arrow-left me-1"></i> Volver al Login
                        </button>
                    </div>
                </form>
            {/if}
        </div>
    </div>
</div>

<style>
    /* Estructura general split */
    .login-wrapper {
        display: flex;
        min-height: 100vh;
        width: 100%;
        background-color: #f8fafc;
        overflow-x: hidden;
    }

    /* -------------------------------------------------------------
       PANEL IZQUIERDO BRANDING
       ------------------------------------------------------------- */
    .brand-panel {
        flex: 1;
        position: relative;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 4rem;
        background: linear-gradient(
            145deg,
            #0f172a 0%,
            #1e293b 50%,
            #1e3a8a 100%
        );
        color: #ffffff;
        overflow: hidden;
    }

    .brand-glow {
        position: absolute;
        top: -150px;
        left: -150px;
        width: 450px;
        height: 450px;
        border-radius: 50%;
        background: radial-gradient(
            circle,
            rgba(59, 130, 246, 0.35) 0%,
            transparent 70%
        );
        filter: blur(50px);
        pointer-events: none;
    }

    .brand-content {
        position: relative;
        z-index: 2;
        margin: auto 0;
        max-width: 480px;
    }

    .logo-box {
        display: inline-block;
        padding: 1.5rem 2rem;
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(12px);
        border-radius: 20px;
        box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.3);
        margin-bottom: 2.5rem;
        opacity: 0;
        transform: translateY(15px);
        transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .logo-box.is-loaded {
        opacity: 1;
        transform: translateY(0);
    }

    .company-logo {
        max-height: 90px;
        max-width: 240px;
        object-fit: contain;
        display: block;
    }

    .badge-brand {
        display: inline-block;
        padding: 0.35rem 0.85rem;
        border-radius: 999px;
        background: rgba(59, 130, 246, 0.25);
        border: 1px solid rgba(147, 197, 253, 0.3);
        color: #93c5fd;
        font-size: 0.8rem;
        font-weight: 600;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        margin-bottom: 1rem;
    }

    .brand-title {
        font-size: 2.5rem;
        font-weight: 800;
        letter-spacing: -0.5px;
        margin-bottom: 1rem;
        color: #f8fafc;
        line-height: 1.15;
    }

    .brand-subtitle {
        font-size: 1.05rem;
        color: #94a3b8;
        line-height: 1.6;
        margin-bottom: 0;
    }

    .brand-footer {
        position: relative;
        z-index: 2;
        color: #64748b;
        font-size: 0.85rem;
    }

    /* -------------------------------------------------------------
       PANEL DERECHO FORMULARIO
       ------------------------------------------------------------- */
    .form-panel {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 3rem 2rem;
        background: #f8fafc;
    }

    .card-login {
        width: 100%;
        max-width: 440px;
        background: #ffffff;
        padding: 2.75rem;
        border-radius: 24px;
        box-shadow:
            0 15px 35px -5px rgba(15, 23, 42, 0.08),
            0 0 0 1px rgba(226, 232, 240, 0.8);
        transition: transform 0.3s ease;
    }

    .header-box {
        margin-bottom: 2rem;
        text-align: left;
    }

    .title {
        font-size: 1.75rem;
        font-weight: 800;
        color: #0f172a;
        margin-bottom: 0.4rem;
        letter-spacing: -0.5px;
    }

    .subtitle {
        font-size: 0.92rem;
        color: #64748b;
        margin-bottom: 0;
    }

    /* Alerta de Error */
    .alert-error {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        padding: 0.85rem 1rem;
        background: #fef2f2;
        border: 1px solid #fecaca;
        border-radius: 12px;
        color: #b91c1c;
        font-size: 0.88rem;
        font-weight: 500;
        margin-bottom: 1.5rem;
    }

    /* Form inputs */
    .form-body {
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
    }

    .form-group {
        display: flex;
        flex-direction: column;
    }

    .input-label {
        font-size: 0.88rem;
        font-weight: 600;
        color: #334155;
        margin-bottom: 0.45rem;
    }

    .input-wrapper {
        position: relative;
        display: flex;
        align-items: center;
    }

    .input-icon {
        position: absolute;
        left: 1rem;
        color: #94a3b8;
        font-size: 1rem;
        display: flex;
        align-items: center;
        pointer-events: none;
    }

    .custom-input {
        width: 100%;
        padding: 0.85rem 2.8rem 0.85rem 2.75rem;
        font-size: 0.95rem;
        color: #0f172a;
        background-color: #f8fafc;
        border: 1.5px solid #e2e8f0;
        border-radius: 12px;
        transition: all 0.2s ease;
        outline: none;
    }

    .custom-input:focus {
        background-color: #ffffff;
        border-color: #2563eb;
        box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
    }

    .custom-input::placeholder {
        color: #94a3b8;
    }

    .btn-toggle-eye {
        position: absolute;
        right: 0.85rem;
        background: none;
        border: none;
        color: #94a3b8;
        font-size: 1.15rem;
        cursor: pointer;
        padding: 0.25rem;
        display: flex;
        align-items: center;
        transition: color 0.2s ease;
    }

    .btn-toggle-eye:hover {
        color: #334155;
    }

    .link-forgot {
        background: none;
        border: none;
        padding: 0;
        font-size: 0.82rem;
        font-weight: 600;
        color: #2563eb;
        cursor: pointer;
        text-decoration: none;
        transition: color 0.2s ease;
    }

    .link-forgot:hover {
        color: #1d4ed8;
        text-decoration: underline;
    }

    /* Botones */
    .form-actions {
        display: flex;
        flex-direction: column;
        gap: 0.85rem;
        margin-top: 0.5rem;
    }

    .btn-primary-custom {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        padding: 0.85rem 1.25rem;
        background: #2563eb;
        color: #ffffff;
        font-weight: 600;
        font-size: 0.95rem;
        border: none;
        border-radius: 12px;
        cursor: pointer;
        box-shadow: 0 4px 14px rgba(37, 99, 235, 0.3);
        transition: all 0.2s ease;
    }

    .btn-primary-custom:hover:not(:disabled) {
        background: #1d4ed8;
        transform: translateY(-1px);
        box-shadow: 0 6px 18px rgba(37, 99, 235, 0.4);
    }

    .btn-primary-custom:disabled {
        opacity: 0.7;
        cursor: not-allowed;
    }

    .btn-success-custom {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        padding: 0.85rem 1.25rem;
        background: #059669;
        color: #ffffff;
        font-weight: 600;
        font-size: 0.95rem;
        border: none;
        border-radius: 12px;
        cursor: pointer;
        box-shadow: 0 4px 14px rgba(5, 150, 105, 0.3);
        transition: all 0.2s ease;
    }

    .btn-success-custom:hover:not(:disabled) {
        background: #047857;
        transform: translateY(-1px);
    }

    .btn-secondary-custom {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        padding: 0.8rem;
        background: #f1f5f9;
        color: #334155;
        font-weight: 600;
        font-size: 0.92rem;
        border: 1px solid #cbd5e1;
        border-radius: 12px;
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .btn-secondary-custom:hover {
        background: #e2e8f0;
    }

    .btn-back {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: none;
        border: none;
        color: #64748b;
        font-size: 0.88rem;
        font-weight: 500;
        cursor: pointer;
        padding: 0.4rem;
        transition: color 0.2s ease;
    }

    .btn-back:hover {
        color: #0f172a;
    }

    /* OTP Grid */
    .otp-grid {
        display: flex;
        justify-content: center;
        gap: 0.6rem;
        margin: 1rem 0;
    }

    .otp-cell {
        width: 48px;
        height: 56px;
        font-size: 1.5rem;
        font-weight: 700;
        text-align: center;
        color: #0f172a;
        background-color: #f8fafc;
        border: 2px solid #e2e8f0;
        border-radius: 12px;
        outline: none;
        transition: all 0.2s ease;
    }

    .otp-cell:focus {
        border-color: #2563eb;
        background-color: #ffffff;
        box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
        transform: translateY(-2px);
    }

    .otp-timer-box {
        margin-top: 0.5rem;
    }

    .timer-badge {
        display: inline-flex;
        align-items: center;
        padding: 0.35rem 0.85rem;
        border-radius: 999px;
        background: #f1f5f9;
        color: #475569;
        font-size: 0.82rem;
        font-weight: 600;
    }

    .timer-urgent {
        background: #fff7ed;
        color: #c2410c;
        animation: pulse 1.2s infinite ease-in-out;
    }

    .timer-expired {
        background: #fef2f2;
        color: #dc2626;
    }

    @keyframes pulse {
        0%,
        100% {
            opacity: 1;
        }
        50% {
            opacity: 0.6;
        }
    }

    /* -------------------------------------------------------------
       RESPONSIVE DESIGN (MÓVILES Y PANTALLAS PEQUEÑAS)
       ------------------------------------------------------------- */
    @media (max-width: 992px) {
        .login-wrapper {
            flex-direction: column;
        }

        .brand-panel {
            padding: 3rem 1.5rem 2rem 1.5rem;
            align-items: center;
            text-align: center;
        }

        .brand-content {
            margin: 0 auto;
        }

        .logo-box {
            margin-bottom: 1.5rem;
            padding: 1rem 1.5rem;
        }

        .company-logo {
            max-height: 60px;
        }

        .brand-title {
            font-size: 2rem;
        }

        .brand-footer {
            display: none;
        }

        .form-panel {
            padding: 2rem 1.25rem 3rem 1.25rem;
        }

        .card-login {
            padding: 2rem 1.5rem;
            border-radius: 20px;
        }

        .otp-cell {
            width: 42px;
            height: 50px;
            font-size: 1.25rem;
        }
    }
</style>
