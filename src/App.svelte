<script>
    import { Router, Route, navigate } from "svelte-routing";
    import { onMount } from "svelte";
    import { authStore } from "./stores/auth";
    import { tenantStore } from "./stores/tenant";

    // Vistas principales
    import Login from "./views/Login.svelte";
    import MainLayout from "./components/MainLayout.svelte";
    import Index from "./views/admin/index.svelte";
    import Dashboard from "./views/admin/dashboard.svelte";
    import Company from "./views/admin/company.svelte";
    import Roles from "./views/admin/roles.svelte";
    import Users from "./views/admin/users.svelte";
    import Visit from "./views/admin/visit.svelte";
    import Placeholder from "./views/Placeholder.svelte";

    // Importamos CSS global
    import "./app.css";

    // Extraer tenant desde parámetro URL (para pruebas locales) o desde el subdominio
    const urlParams =
        typeof window !== "undefined"
            ? new URLSearchParams(window.location.search)
            : null;
    const urlTenant =
        urlParams?.get("tenant") ||
        urlParams?.get("subdominio") ||
        urlParams?.get("idcl");

    if (urlTenant) {
        tenantStore.set(urlTenant);
    } else if (typeof window !== "undefined") {
        const hostParts = window.location.hostname.split(".");
        // Si tiene formato subdominio.dominio.ext (ej: midominio.clienthub.cl o midominio.localhost)
        if (
            hostParts.length >= 2 &&
            hostParts[0] !== "localhost" &&
            hostParts[0] !== "www" &&
            hostParts[0] !== "127"
        ) {
            tenantStore.set(hostParts[0]);
        }
    }
</script>

<Router>
    <!-- Ruta Login y Raíz -->
    <Route path="/login">
        <Login />
    </Route>

    <Route path="/" exact>
        <Login />
    </Route>

    <!-- Rutas Administrativas -->
    <Route path="/admin/index">
        <MainLayout>
            <Index />
        </MainLayout>
    </Route>

    <Route path="/admin/dashboard">
        <MainLayout>
            <Dashboard />
        </MainLayout>
    </Route>

    <Route path="/admin/company">
        <MainLayout>
            <Company />
        </MainLayout>
    </Route>

    <Route path="/admin/roles">
        <MainLayout>
            <Roles />
        </MainLayout>
    </Route>

    <Route path="/admin/users">
        <MainLayout>
            <Users />
        </MainLayout>
    </Route>

    <Route path="/admin/visit">
        <MainLayout>
            <Visit />
        </MainLayout>
    </Route>

    <Route path="/admin/visits">
        <MainLayout>
            <Visit />
        </MainLayout>
    </Route>

    <!-- Módulos adicionales con Placeholder mientras se integran -->
    <Route path="/admin/programs">
        <MainLayout>
            <Placeholder title="Programas" />
        </MainLayout>
    </Route>

    <Route path="/admin/school">
        <MainLayout>
            <Placeholder title="Colegios" />
        </MainLayout>
    </Route>

    <Route path="/admin/gateways">
        <MainLayout>
            <Placeholder title="Pasarelas de Pago" />
        </MainLayout>
    </Route>

    <Route path="/admin/quotes">
        <MainLayout>
            <Placeholder title="Cotizaciones" />
        </MainLayout>
    </Route>

    <Route path="/admin/sales">
        <MainLayout>
            <Placeholder title="Ventas" />
        </MainLayout>
    </Route>

    <Route path="/admin/course">
        <MainLayout>
            <Placeholder title="Cursos" />
        </MainLayout>
    </Route>

    <Route path="/admin/voucher">
        <MainLayout>
            <Placeholder title="Comprobantes / Vouchers" />
        </MainLayout>
    </Route>

    <Route path="/admin/entry">
        <MainLayout>
            <Placeholder title="Entradas" />
        </MainLayout>
    </Route>

    <Route path="/admin/listpay">
        <MainLayout>
            <Placeholder title="Lista de Pagos" />
        </MainLayout>
    </Route>

    <!-- Apertura y Pagos -->
    <Route path="/opening">
        <Placeholder title="Apertura" />
    </Route>

    <Route path="/opening/*">
        <Placeholder title="Apertura" />
    </Route>

    <Route path="/payment">
        <Placeholder title="Portal de Pagos" />
    </Route>

    <Route path="/payment/*">
        <Placeholder title="Portal de Pagos" />
    </Route>

    <Route path="/flowpagos/*">
        <Placeholder title="Flow Pagos" />
    </Route>

    <Route path="/mercadopago/*">
        <Placeholder title="Mercado Pago" />
    </Route>
</Router>
