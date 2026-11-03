<script>
    import { link } from "svelte-routing";
    import { authStore } from "../../stores/auth";
    import { secureStorage } from "../../lib/secureStore";

    $: userData = $authStore.user || secureStorage.getItem("_us_") || {};
    $: userName = userData?.name || userData?.username || "Usuario";
</script>

<div class="container-fluid py-4">
    <div class="row mb-4">
        <div class="col-12">
            <div class="card border-0 shadow-sm p-4 bg-light">
                <h2 class="h4 mb-2">¡Bienvenido, {userName}!</h2>
                <p class="text-muted mb-0">
                    Selecciona una de las opciones del menú lateral o accede
                    rápidamente a los módulos principales:
                </p>
            </div>
        </div>
    </div>
</div>
