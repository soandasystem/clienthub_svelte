<script>
    import { link } from "svelte-routing";
    import { authStore } from "../stores/auth";
    import { hasPermission } from "../lib/utils";
    import { secureStorage } from "../lib/secureStore";
    import { isSidebarOpen, toggleSidebar } from "../stores/sidebarStore";

    // Reacciona al store reactivo Y al secureStorage como fallback
    $: userData = $authStore.user || secureStorage.getItem("_us_") || {};
    $: rol = userData?.rol_id ?? userData?.id ?? 1; // fallback para no bloquear el menú

    export let activePath = "";

    $: baseUrl = "/admin";

    // Control del submenú
    let openSubmenu = "";

    // Abrir automáticamente si la ruta corresponde a una opción
    $: {
        if (
            [`${baseUrl}/company`, `${baseUrl}/roles`, `${baseUrl}/users`].some(
                (path) => activePath.startsWith(path),
            )
        ) {
            openSubmenu = "config";
        } else {
            openSubmenu = "";
        }
    }

    const toggleConfig = () => {
        openSubmenu = openSubmenu === "config" ? "" : "config";
    };
</script>

{#if !$isSidebarOpen}
    <button
        class="hamburger-btn floating"
        on:click={toggleSidebar}
        title="Abrir menú"
        aria-label="Abrir menú"
    >
        <i class="fa fa-bars"></i>
    </button>
{/if}

<div class="sidebar-menu {$isSidebarOpen ? '' : 'closed'}">
    <div class="sidebar-menu-header">
        <div class="brand-text">MENÚ PRINCIPAL</div>

        <button
            class="hamburger-btn"
            on:click={toggleSidebar}
            title="Cerrar menú"
            aria-label="Cerrar menú"
        >
            <i class="fa fa-bars"></i>
        </button>
    </div>

    <div class="sidebar-menu-inner">
        <ul id="main-menu" class="main-menu">
            <li class="menu-divider">Administración</li>

            {#if hasPermission(rol, "company") || hasPermission(rol, "roles") || hasPermission(rol, "users")}
                <li
                    class="has-sub {openSubmenu === 'config'
                        ? 'active opened'
                        : ''}"
                >
                    <a href="#!" on:click|preventDefault={toggleConfig}>
                        <i class="fa fa-fw fa-cogs"></i>
                        <span class="title">Configuración Base</span>
                        <i class="fa fa-chevron-right chevron"></i>
                    </a>

                    {#if openSubmenu === "config"}
                        <ul class="sub-menu">
                            {#if hasPermission(rol, "company")}
                                <li
                                    class={activePath.startsWith(
                                        `${baseUrl}/company`,
                                    )
                                        ? "active"
                                        : ""}
                                >
                                    <a href="{baseUrl}/company" use:link>
                                        <i class="fa fa-building"></i>
                                        <span class="title">Company</span>
                                    </a>
                                </li>
                            {/if}

                            {#if hasPermission(rol, "roles")}
                                <li
                                    class={activePath.startsWith(
                                        `${baseUrl}/roles`,
                                    )
                                        ? "active"
                                        : ""}
                                >
                                    <a href="{baseUrl}/roles" use:link>
                                        <i class="fa fa-user-tag"></i>
                                        <span class="title">Roles</span>
                                    </a>
                                </li>
                            {/if}

                            {#if hasPermission(rol, "users")}
                                <li
                                    class={activePath.startsWith(
                                        `${baseUrl}/users`,
                                    )
                                        ? "active"
                                        : ""}
                                >
                                    <a href="{baseUrl}/users" use:link>
                                        <i class="fa fa-users"></i>
                                        <span class="title">Users</span>
                                    </a>
                                </li>
                            {/if}
                        </ul>
                    {/if}
                </li>
            {/if}

            <li class="menu-divider">Gestión Comercial</li>
            <li class={activePath.startsWith(`${baseUrl}/visit`) ? "active" : ""}>
                <a href="{baseUrl}/visit" use:link>
                    <i class="fa fa-calendar-check"></i>
                    <span class="title">Programa de Visitas</span>
                </a>
            </li>
        </ul>
    </div>
</div>

<style>
    /* Contenedor principal */
    .sidebar-menu {
        width: 260px;
        min-width: 260px;
        background-color: #0c0d12;
        color: #ffffff;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        transition:
            width 0.3s ease,
            min-width 0.3s ease;
        position: relative;
        z-index: 100;
        box-shadow: 3px 0 16px rgba(0, 0, 0, 0.45);
        user-select: none;
    }

    .sidebar-menu.closed {
        width: 0;
        min-width: 0;
        overflow: hidden;
    }

    /* Botones hamburguesa */
    .hamburger-btn {
        background: none;
        border: none;
        color: #ffffff;
        font-size: 1.4rem;
        cursor: pointer;
        padding: 0.5rem;
        transition:
            color 0.2s ease,
            transform 0.2s ease;
    }

    .hamburger-btn:hover {
        color: #38bdf8;
        transform: scale(1.1);
    }

    .hamburger-btn.floating {
        position: fixed;
        top: 14px;
        left: 14px;
        z-index: 1050;
        background-color: #0c0d12;
        color: #ffffff;
        border: 1px solid #1e2533;
        border-radius: 8px;
        width: 42px;
        height: 42px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
        transition: all 0.2s ease;
    }

    .hamburger-btn.floating:hover {
        background-color: #161922;
        color: #38bdf8;
        border-color: #38bdf8;
        transform: scale(1.08);
    }

    /* Cabecera */
    .sidebar-menu-header {
        height: 70px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 25px;
        background-color: #06070a;
        border-bottom: 1px solid #1a1e28;
        margin-bottom: 8px;
    }

    .brand-text {
        color: #ffffff;
        font-weight: 700;
        font-size: 0.85rem;
        letter-spacing: 1.5px;
        text-transform: uppercase;
    }

    .sidebar-menu-inner {
        flex: 1;
        overflow-y: auto;
    }

    /* Divisor */
    .menu-divider {
        padding: 18px 25px 8px;
        font-size: 0.72rem;
        font-weight: 700;
        text-transform: uppercase;
        color: #94a3b8;
        letter-spacing: 1.5px;
    }

    /* Menú principal */
    .main-menu {
        list-style: none;
        padding: 0;
        margin: 0;
    }

    .main-menu li {
        position: relative;
    }

    .main-menu li a {
        display: flex;
        align-items: center;
        padding: 12px 25px;
        color: #ffffff;
        text-decoration: none;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        font-size: 0.88rem;
        font-weight: 500;
        border-left: 3px solid transparent;
    }

    .main-menu li a i {
        width: 20px;
        margin-right: 12px;
        font-size: 1rem;
        text-align: center;
        color: #cbd5e1;
        transition: all 0.2s ease;
    }

    .main-menu li a:hover {
        background-color: rgba(56, 189, 248, 0.12);
        color: #38bdf8 !important;
        border-left-color: #38bdf8;
    }

    .main-menu li a:hover i {
        color: #38bdf8 !important;
        transform: scale(1.15);
    }

    .main-menu li.active > a {
        background-color: rgba(56, 189, 248, 0.18);
        color: #38bdf8 !important;
        border-left-color: #38bdf8;
        font-weight: 600;
    }

    .main-menu li.active > a i {
        color: #38bdf8 !important;
    }

    /* Submenú */
    .sub-menu {
        list-style: none;
        padding: 6px 0;
        margin: 0;
        background-color: #06070a;
        border-top: 1px solid #141822;
        border-bottom: 1px solid #141822;
        box-shadow: inset 3px 0 0 rgba(56, 189, 248, 0.25);
    }

    .sub-menu li a {
        padding: 10px 25px 10px 52px;
        font-size: 0.82rem;
        color: #ffffff !important;
        font-weight: 400;
        border-left: 3px solid transparent;
        transition: all 0.2s ease;
    }

    .sub-menu li a:hover {
        background-color: rgba(56, 189, 248, 0.15);
        color: #38bdf8 !important;
        border-left-color: #38bdf8;
        padding-left: 56px;
    }

    .sub-menu li.active a {
        background-color: rgba(56, 189, 248, 0.2);
        color: #38bdf8 !important;
        border-left-color: #38bdf8;
        font-weight: 600;
    }

    /* Flecha */
    .chevron {
        font-size: 11px !important;
        margin-left: auto;
        color: #94a3b8;
        transition:
            transform 0.3s ease,
            color 0.2s ease;
    }

    .main-menu li a:hover .chevron {
        color: #38bdf8;
    }

    li.opened > a .chevron {
        color: #38bdf8;
        transform: rotate(90deg);
    }

    /* Scrollbar */
    .sidebar-menu::-webkit-scrollbar,
    .sidebar-menu-inner::-webkit-scrollbar {
        width: 5px;
    }

    .sidebar-menu::-webkit-scrollbar-track,
    .sidebar-menu-inner::-webkit-scrollbar-track {
        background: #06070a;
    }

    .sidebar-menu::-webkit-scrollbar-thumb,
    .sidebar-menu-inner::-webkit-scrollbar-thumb {
        background: #1e293b;
        border-radius: 4px;
    }

    .sidebar-menu::-webkit-scrollbar-thumb:hover,
    .sidebar-menu-inner::-webkit-scrollbar-thumb:hover {
        background: #38bdf8;
    }
</style>
