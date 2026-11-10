<script>
    import { onMount } from "svelte";
    import dayjs from "dayjs";
    import Swal from "sweetalert2";
    import { secureStorage } from "../../lib/secureStore";
    import { tenantStore } from "../../stores/tenant";
    import api from "../../lib/apis.js";
    import Company from "./company.svelte";

    // Información de sesión / usuario
    const userData = secureStorage.getItem("_us_") || {};
    const schemaName = userData?.schema || "salesvisit";
    const author = userData?.username || userData?.name || "Supervisor";

    var vendedores = [];
    var visits = [];

    // Estado del formulario
    const getInitialForm = () => ({
        vendedorId: "vend_1", // Default: Carlos Pérez para conveniencia inmediata
        vendedorName: "Carlos Pérez",
        clienteId: "cli_101", // Default: Comercial ABC
        clienteName: "Comercial ABC",
        tipo: "CRM_CUSTOMER",
        fecha: "2026-10-31", // Ejemplo del supervisor
        hora: "10:00", // Ejemplo del supervisor
        direccion: "Av. Providencia 1234, Of. 602, Providencia",
        contacto: "Mariana Silva",
        telefono: "+56 9 8765 4321",
        objetivo:
            "Reunión de seguimiento comercial y presentación de propuesta",
        notas: "",
    });

    let form = getInitialForm();
    let isEditing = false;
    let editingId = null;
    let showModal = false;

    // Filtros de búsqueda y vista
    let filterVendedor = "ALL";
    let filterTipo = "ALL";
    let filterStatus = "ALL";
    let searchTerm = "";
    let sortDirection = "asc"; // 'asc' = fecha más próxima primero

    // Clientes disponibles según el vendedor seleccionado en el formulario
    $: selectedVendedor = vendedores.find((v) => v.id === form.vendedorId);
    $: availableClients = selectedVendedor ? selectedVendedor.clients : [];

    // Manejar cambio de vendedor en el formulario
    function handleVendedorChange(event) {
        const vendId = event.target.value;
        form.vendedorId = vendId;
        const vend = vendedores.find((v) => v.id === vendId);

        if (vend) {
            form.vendedorName = vend.name;
            // Seleccionar automáticamente el primer cliente si existe
            if (vend.clients.length > 0) {
                const firstClient = vend.clients[0];
                form.clienteId = firstClient.id;
                form.clienteName = firstClient.name;
                form.tipo = firstClient.type;
                form.direccion = firstClient.address || "";
                form.contacto = firstClient.contact || "";
                form.telefono = firstClient.phone || "";
            } else {
                form.clienteId = "";
                form.clienteName = "";
                form.tipo = "";
                form.direccion = "";
                form.contacto = "";
                form.telefono = "";
            }
        }
    }

    // Manejar cambio de cliente en el formulario
    function handleClientChange(event) {
        const cliId = event.target.value;
        form.clienteId = cliId;
        const cli = availableClients.find((c) => c.id === cliId);

        if (cli) {
            form.clienteName = cli.name;
            form.tipo = cli.type; // Se sincroniza automáticamente el tipo (CRM_CUSTOMER o PROSPECT)
            form.direccion = cli.address || "";
            form.contacto = cli.contact || "";
            form.telefono = cli.phone || "";
        }
    }

    // Cargar datos persistidos o iniciales
    onMount(() => {
        //          visits = [...initialVisits];
        // Cargar vendedores desde API si está disponible
        fetchApiUsers();
        // Cargar visitas desde API si está disponible
        fetchApiVisit();
    });

    const fetchApiUsers = async () => {
        try {
            const resp = await api.getData(
                "users/informe",
                "",
                `roles_id=3&company_id=${Company}`,
                "",
                schemaName,
            );
            if (
                resp &&
                resp.status === "success" &&
                Array.isArray(resp.data) &&
                resp.data.length > 0
            ) {
                // Si la API tiene usuarios, combinamos los nombres manteniendo la estructura de clientes
                console.log(
                    "[Visit] Usuarios cargados desde API:",
                    resp.data.length,
                );
                vendedores = [...resp.data];
            }
        } catch (err) {
            console.warn("[Visit] Usando lista de vendedores configurada");
        }
    };
    const fetchApiVisit = async () => {
        try {
            const resp = await api.getData(
                "visit/informe",
                "",
                `company_id=${Company}`,
                "",
                schemaName,
            );
            if (
                resp &&
                resp.status === "success" &&
                Array.isArray(resp.data) &&
                resp.data.length > 0
            ) {
                console.log(
                    "[Visit] Visitas cargadas desde API:",
                    resp.data.length,
                );
                // Normalizar la respuesta de la API al shape interno usado por filtros,
                // tarjetas y el formulario de edición.
                visits = resp.data.map((v) => ({
                    id:           v.id,
                    vendedorId:   v.seller_id,
                    vendedorName: v.users?.fullname   ?? "",
                    clienteId:    v.customer_id,
                    clienteName:  v.customers?.company_name ?? "",
                    tipo:         v.type,
                    // scheduled_at viene como ISO datetime → separar fecha y hora
                    fecha:        v.scheduled_at ? dayjs(v.scheduled_at).format("YYYY-MM-DD") : "",
                    hora:         v.scheduled_at ? dayjs(v.scheduled_at).format("HH:mm")      : "",
                    direccion:    v.customers?.address        ?? "",
                    contacto:     v.customers?.contact_person ?? "",
                    telefono:     v.customers?.phone          ?? "",
                    objetivo:     v.objetive ?? "",
                    notas:        v.notas    ?? "",
                    status:       v.status   ?? "PROGRAMADA",
                    createdBy:    v.created_by ?? "",
                    createdAt:    v.created_at ?? "",
                }));
            }
        } catch (err) {
            console.warn("[Visit] Usando lista de visitas configurada");
        }
    };

    function saveToLocalStorage(data) {
        /*
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.error("Error al guardar en localStorage:", e);
        }
            */
    }

    // Guardar / Programar visita
    async function handleSubmit() {
        if (!form.vendedorId) {
            Swal.fire(
                "Atención",
                "Por favor seleccione un vendedor.",
                "warning",
            );
            return;
        }

        if (!form.clienteId) {
            Swal.fire(
                "Atención",
                "Por favor seleccione un cliente de la lista.",
                "warning",
            );
            return;
        }

        if (!form.fecha) {
            Swal.fire(
                "Atención",
                "Por favor ingrese la fecha de la visita.",
                "warning",
            );
            return;
        }

        if (!form.hora) {
            Swal.fire(
                "Atención",
                "Por favor ingrese la hora de la visita.",
                "warning",
            );
            return;
        }

        if (isEditing && editingId) {
            // Actualizar visita existente
            visits = visits.map((v) => {
                if (v.id === editingId) {
                    return {
                        ...v,
                        ...form,
                        updatedAt: new Date().toISOString(),
                    };
                }
                return v;
            });

            Swal.fire({
                icon: "success",
                title: "Visita Actualizada",
                text: `La visita para ${form.clienteName} ha sido modificada con éxito.`,
                timer: 2000,
                showConfirmButton: false,
            });

            isEditing = false;
            editingId = null;
            showModal = false;
        } else {
            // Crear nueva visita programada
            const newVisit = {
                id: "vis_" + Date.now(),
                ...form,
                status: "PROGRAMADA",
                createdBy: author,
                createdAt: new Date().toISOString(),
            };

            // Intentar notificar a la API si está disponible
            try {
                api.setData("visits", newVisit, "", "", schemaName).catch(
                    () => {},
                );
            } catch (e) {}

            visits = [newVisit, ...visits];
            saveToLocalStorage(visits);
            showModal = false;

            Swal.fire({
                icon: "success",
                title: "¡Visita Programada!",
                html: `
                    <div class="text-start fs-6 p-2">
                        <p class="mb-1"><strong>Vendedor:</strong> ${form.vendedorName}</p>
                        <p class="mb-1"><strong>Cliente:</strong> ${form.clienteName} <span class="badge ${form.tipo === "CRM_CUSTOMER" ? "bg-primary" : "bg-warning text-dark"}">${form.tipo}</span></p>
                        <p class="mb-1"><strong>Fecha:</strong> ${dayjs(form.fecha).format("DD/MM/YYYY")}</p>
                        <p class="mb-0"><strong>Hora:</strong> ${form.hora} hrs</p>
                    </div>
                `,
                confirmButtonColor: "#2563eb",
            });
        }

        // Mantener vendedor y fecha/hora sugerida para agilizar la carga sucesiva
        const currentVendId = form.vendedorId;
        const currentVendName = form.vendedorName;
        form = {
            ...getInitialForm(),
            vendedorId: currentVendId,
            vendedorName: currentVendName,
            fecha: form.fecha,
            hora: form.hora,
        };

        // Asignar primer cliente del vendedor activo
        const v = vendedores.find((item) => item.id === currentVendId);
        if (v && v.clients.length > 0) {
            form.clienteId = v.clients[0].id;
            form.clienteName = v.clients[0].full_name;
            form.tipo = v.clients[0].type;
            form.direccion = v.clients[0].address || "";
            form.contacto = v.clients[0].contact || "";
            form.telefono = v.clients[0].phone || "";
        }
    }

    // Abrir modal para nueva visita
    function openNewVisitModal() {
        isEditing = false;
        editingId = null;
        form = getInitialForm();
        showModal = true;
    }

    // Cerrar modal
    function closeModal() {
        showModal = false;
        isEditing = false;
        editingId = null;
    }

    // Cargar visita en el formulario para edición y abrir modal
    function handleEditVisit(visit) {
        console.log(visit);
        isEditing = true;
        editingId = visit.id;
        form = {
            vendedorId:   visit.vendedorId   ?? visit.seller_id,
            vendedorName: visit.vendedorName ?? visit.users?.fullname ?? "",
            clienteId:    visit.clienteId    ?? visit.customer_id,
            clienteName:  visit.clienteName  ?? visit.customers?.company_name ?? "",
            tipo:         visit.tipo         ?? visit.type,
            // Si viene el campo ya separado lo usa; si no, parte el timestamp ISO
            fecha: visit.fecha || (visit.scheduled_at ? dayjs(visit.scheduled_at).format("YYYY-MM-DD") : ""),
            hora:  visit.hora  || (visit.scheduled_at ? dayjs(visit.scheduled_at).format("HH:mm")      : ""),
            direccion: visit.direccion ?? visit.customers?.address        ?? "",
            contacto:  visit.contacto  ?? visit.customers?.contact_person ?? "",
            telefono:  visit.telefono  ?? visit.customers?.phone          ?? "",
            objetivo:  visit.objetivo  ?? visit.objetive ?? "",
            notas:     visit.notas     ?? "",
        };

        showModal = true;
    }

    // Cambiar estado de visita (Programada / Realizada / Cancelada)
    function handleToggleStatus(visit, newStatus) {
        visits = visits.map((v) => {
            if (v.id === visit.id) {
                return { ...v, status: newStatus };
            }
            return v;
        });
        saveToLocalStorage(visits);

        const statusLabels = {
            REALIZADA: "marcada como Realizada",
            PROGRAMADA: "restaurada como Programada",
            CANCELADA: "marcada como Cancelada",
        };

        Swal.fire({
            toast: true,
            position: "top-end",
            icon: "success",
            title: `Visita ${statusLabels[newStatus] || newStatus}`,
            showConfirmButton: false,
            timer: 2500,
        });
    }

    // Eliminar visita
    function handleDeleteVisit(visit) {
        Swal.fire({
            title: "¿Eliminar visita programada?",
            html: `¿Estás seguro de eliminar la visita con <strong>${visit.clienteName}</strong> del día <strong>${dayjs(visit.fecha).format("DD/MM/YYYY")}</strong>?`,
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#ef4444",
            cancelButtonColor: "#6b7280",
            confirmButtonText: "Sí, eliminar",
            cancelButtonText: "Cancelar",
        }).then((result) => {
            if (result.isConfirmed) {
                visits = visits.filter((v) => v.id !== visit.id);
                saveToLocalStorage(visits);
                Swal.fire(
                    "Eliminada",
                    "La visita se ha eliminado del programa.",
                    "success",
                );
            }
        });
    }

    // Filtrar visitas
    $: filteredVisits = visits.filter((v) => {
        // Filtro por Vendedor
        if (filterVendedor !== "ALL" && v.vendedorId !== filterVendedor) {
            return false;
        }
        // Filtro por Tipo de Cliente (CRM_CUSTOMER vs PROSPECT)
        if (filterTipo !== "ALL" && v.tipo !== filterTipo) {
            return false;
        }
        // Filtro por Estado
        if (filterStatus !== "ALL" && v.status !== filterStatus) {
            return false;
        }
        // Filtro de texto (búsqueda por cliente, vendedor o dirección)
        if (searchTerm.trim() !== "") {
            const term = searchTerm.toLowerCase();
            const matchClient = v.clienteName?.toLowerCase().includes(term);
            const matchVendedor = v.vendedorName?.toLowerCase().includes(term);
            const matchDir = v.direccion?.toLowerCase().includes(term);
            const matchObj = v.objetivo?.toLowerCase().includes(term);
            if (!matchClient && !matchVendedor && !matchDir && !matchObj) {
                return false;
            }
        }
        return true;
    });

    // Ordenar visitas por fecha y hora (Requisito clave: mostrar tarjetas ordenadas por fecha)
    $: sortedVisits = [...filteredVisits].sort((a, b) => {
        const timeA = a.hora || "00:00";
        const timeB = b.hora || "00:00";
        const dtA = `${a.fecha}T${timeA}:00`;
        const dtB = `${b.fecha}T${timeB}:00`;

        if (sortDirection === "asc") {
            return dtA.localeCompare(dtB);
        } else {
            return dtB.localeCompare(dtA);
        }
    });

    // Estadísticas rápidas para el supervisor
    $: statsTotal = visits.length;
    $: statsCrm = visits.filter((v) => v.tipo === "CRM_CUSTOMER").length;
    $: statsProspect = visits.filter((v) => v.tipo === "PROSPECT").length;
    $: statsPending = visits.filter((v) => v.status === "PROGRAMADA").length;
    $: statsDone = visits.filter((v) => v.status === "REALIZADA").length;
</script>

<div class="visit-page-container">
    <!-- Header principal -->
    <div
        class="d-flex flex-column flex-md-row align-items-md-center justify-content-between mb-4 pb-2 border-bottom"
    >
        <div>
            <div class="d-flex align-items-center gap-2 mb-1">
                <span class="text-muted fs-7">Control de Gestión de Ventas</span
                >
            </div>
            <h1 class="h3 fw-bold text-gray-900 mb-0">Programa de Visitas</h1>
            <p class="text-secondary small mb-0">
                Planificación de visitas comerciales a clientes CRM y prospectos
                asignados por vendedor.
            </p>
        </div>

        <div class="d-flex align-items-center gap-2 mt-3 mt-md-0">
            <button
                class="btn btn-sm btn-primary d-flex align-items-center gap-1.5 shadow-sm"
                on:click={openNewVisitModal}
            >
                <i class="fa fa-calendar-plus"></i>
                <span>Programar Visita</span>
            </button>
        </div>
    </div>

    <!-- Tarjetas de métricas para el supervisor -->
    <div class="row g-3 mb-4">
        <div class="col-6 col-lg-3">
            <div
                class="card metric-card shadow-sm border-0 border-start border-4 border-primary h-100"
            >
                <div class="card-body p-3">
                    <div
                        class="d-flex align-items-center justify-content-between"
                    >
                        <div>
                            <div
                                class="text-uppercase tracking-wider fs-8 fw-bold text-muted mb-1"
                            >
                                Total Visitas
                            </div>
                            <div class="h3 fw-bold text-gray-900 mb-0">
                                {statsTotal}
                            </div>
                        </div>
                        <div
                            class="metric-icon-box bg-primary-subtle text-primary"
                        >
                            <i class="fa fa-calendar-days fs-5"></i>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="col-6 col-lg-3">
            <div
                class="card metric-card shadow-sm border-0 border-start border-4 border-info h-100"
            >
                <div class="card-body p-3">
                    <div
                        class="d-flex align-items-center justify-content-between"
                    >
                        <div>
                            <div
                                class="text-uppercase tracking-wider fs-8 fw-bold text-muted mb-1"
                            >
                                Clientes CRM
                            </div>
                            <div class="h3 fw-bold text-info mb-0">
                                {statsCrm}
                            </div>
                        </div>
                        <div class="metric-icon-box bg-info-subtle text-info">
                            <i class="fa fa-user-check fs-5"></i>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="col-6 col-lg-3">
            <div
                class="card metric-card shadow-sm border-0 border-start border-4 border-warning h-100"
            >
                <div class="card-body p-3">
                    <div
                        class="d-flex align-items-center justify-content-between"
                    >
                        <div>
                            <div
                                class="text-uppercase tracking-wider fs-8 fw-bold text-muted mb-1"
                            >
                                Prospectos
                            </div>
                            <div class="h3 fw-bold text-warning-emphasis mb-0">
                                {statsProspect}
                            </div>
                        </div>
                        <div
                            class="metric-icon-box bg-warning-subtle text-warning-emphasis"
                        >
                            <i class="fa fa-user-plus fs-5"></i>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="col-6 col-lg-3">
            <div
                class="card metric-card shadow-sm border-0 border-start border-4 border-success h-100"
            >
                <div class="card-body p-3">
                    <div
                        class="d-flex align-items-center justify-content-between"
                    >
                        <div>
                            <div
                                class="text-uppercase tracking-wider fs-8 fw-bold text-muted mb-1"
                            >
                                Programadas
                            </div>
                            <div class="h3 fw-bold text-success mb-0">
                                {statsPending}
                            </div>
                        </div>
                        <div
                            class="metric-icon-box bg-success-subtle text-success"
                        >
                            <i class="fa fa-clock fs-5"></i>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- MODAL DE PROGRAMACIÓN / EDICIÓN DE VISITAS -->
    {#if showModal}
        <div class="modal-backdrop fade show"></div>
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div
            class="modal fade show d-block"
            tabindex="-1"
            role="dialog"
            aria-modal="true"
            on:click|self={closeModal}
            on:keydown={(e) => e.key === "Escape" && closeModal()}
        >
            <div
                class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable"
            >
                <div class="modal-content border-0 shadow-lg">
                    <!-- Modal Header -->
                    <div
                        class="modal-header bg-white border-bottom py-3 px-4 d-flex align-items-center justify-content-between"
                    >
                        <div class="d-flex align-items-center gap-2.5">
                            <div
                                class="header-icon-circle bg-primary text-white"
                            >
                                <i
                                    class="fa {isEditing
                                        ? 'fa-pencil'
                                        : 'fa-calendar-plus'}"
                                ></i>
                            </div>
                            <div>
                                <h5
                                    class="modal-title fw-bold text-dark mb-0 fs-6"
                                >
                                    {isEditing
                                        ? "Modificar Visita Programada"
                                        : "Ingreso al Programa de Visitas"}
                                </h5>
                                <small class="text-muted fs-8">
                                    El supervisor selecciona el vendedor, elige
                                    el cliente/prospecto y asigna la fecha y
                                    hora.
                                </small>
                            </div>
                        </div>
                        <button
                            type="button"
                            class="btn-close"
                            aria-label="Cerrar modal"
                            title="Cerrar"
                            on:click={closeModal}
                        ></button>
                    </div>

                    <!-- Formulario dentro del modal -->
                    <form on:submit|preventDefault={handleSubmit}>
                        <div class="modal-body p-4 bg-body-tertiary">
                            <div class="row g-3">
                                <!-- 1. VENDEDOR (DROPDOWN) -->
                                <div class="col-12 col-md-6">
                                    <label
                                        for="vendedorSelect"
                                        class="form-label fw-semibold text-dark fs-7"
                                    >
                                        <i
                                            class="fa fa-user-tie text-primary me-1"
                                        ></i>
                                        Vendedor:
                                        <span class="text-danger">*</span>
                                    </label>
                                    <select
                                        id="vendedorSelect"
                                        class="form-select shadow-xs"
                                        value={form.vendedorId}
                                        on:change={handleVendedorChange}
                                        required
                                    >
                                        <option value="" disabled
                                            >-- Seleccione Vendedor --</option
                                        >
                                        {#each vendedores as vend}
                                            <option value={vend.id}>
                                                {vend.full_name} ({vend.clients
                                                    .length} clientes)
                                            </option>
                                        {/each}
                                    </select>
                                    <div class="form-text fs-8 text-muted">
                                        {#if selectedVendedor}
                                            <i class="fa fa-map-pin me-1"></i>
                                            {selectedVendedor.zone}
                                        {:else}
                                            Selecciona el vendedor asignado.
                                        {/if}
                                    </div>
                                </div>

                                <!-- 2. CLIENTE DEL VENDEDOR (DROPDOWN DINÁMICO) -->
                                <div class="col-12 col-md-6">
                                    <label
                                        for="clienteSelect"
                                        class="form-label fw-semibold text-dark fs-7"
                                    >
                                        <i
                                            class="fa fa-building text-primary me-1"
                                        ></i>
                                        Cliente / Prospecto:
                                        <span class="text-danger">*</span>
                                    </label>
                                    <select
                                        id="clienteSelect"
                                        class="form-select shadow-xs"
                                        value={form.clienteId}
                                        on:change={handleClientChange}
                                        disabled={availableClients.length === 0}
                                        required
                                    >
                                        {#if availableClients.length === 0}
                                            <option value=""
                                                >-- Sin clientes para este
                                                vendedor --</option
                                            >
                                        {:else}
                                            <option value="" disabled
                                                >-- Seleccione Cliente del
                                                Vendedor --</option
                                            >
                                            {#each availableClients as cli}
                                                <option value={cli.id}>
                                                    {cli.name} — [{cli.type ===
                                                    "CRM_CUSTOMER"
                                                        ? "Cliente CRM"
                                                        : "Prospecto"}]
                                                </option>
                                            {/each}
                                        {/if}
                                    </select>
                                    <div class="form-text fs-8 text-muted">
                                        Clientes y prospectos asignados al
                                        vendedor.
                                    </div>
                                </div>

                                <!-- 3. TIPO (CRM_CUSTOMER vs PROSPECT) -->
                                <div class="col-12 col-md-6">
                                    <label
                                        for="tipoClienteInput"
                                        class="form-label fw-semibold text-dark fs-7"
                                    >
                                        <i class="fa fa-tag text-primary me-1"
                                        ></i> Tipo de Cliente:
                                    </label>
                                    <div class="input-group">
                                        <input
                                            id="tipoClienteInput"
                                            type="text"
                                            class="form-control fw-bold bg-white"
                                            value={form.tipo || "Sin selección"}
                                            readonly
                                        />
                                        {#if form.tipo === "CRM_CUSTOMER"}
                                            <span
                                                class="input-group-text bg-primary text-white fs-7"
                                            >
                                                <i
                                                    class="fa fa-shield-check me-1"
                                                ></i> CRM
                                            </span>
                                        {:else if form.tipo === "PROSPECT"}
                                            <span
                                                class="input-group-text bg-warning text-dark fs-7"
                                            >
                                                <i class="fa fa-bullseye me-1"
                                                ></i> Prospecto
                                            </span>
                                        {:else}
                                            <span
                                                class="input-group-text bg-light text-muted fs-7"
                                                >-</span
                                            >
                                        {/if}
                                    </div>
                                    <div class="form-text fs-8 text-muted">
                                        Asignado automáticamente según el
                                        cliente.
                                    </div>
                                </div>

                                <!-- 4. FECHA DE LA VISITA -->
                                <div class="col-12 col-sm-6 col-md-3">
                                    <label
                                        for="fechaVisita"
                                        class="form-label fw-semibold text-dark fs-7"
                                    >
                                        <i
                                            class="fa fa-calendar-day text-primary me-1"
                                        ></i>
                                        Fecha:
                                        <span class="text-danger">*</span>
                                    </label>
                                    <input
                                        id="fechaVisita"
                                        type="date"
                                        class="form-control shadow-xs"
                                        bind:value={form.fecha}
                                        required
                                    />
                                    <div class="form-text fs-8 text-muted">
                                        {form.fecha
                                            ? dayjs(form.fecha).format(
                                                  "DD/MM/YYYY",
                                              )
                                            : "dd/mm/aaaa"}
                                    </div>
                                </div>

                                <!-- 5. HORA DE LA VISITA -->
                                <div class="col-12 col-sm-6 col-md-3">
                                    <label
                                        for="horaVisita"
                                        class="form-label fw-semibold text-dark fs-7"
                                    >
                                        <i class="fa fa-clock text-primary me-1"
                                        ></i>
                                        Hora:
                                        <span class="text-danger">*</span>
                                    </label>
                                    <input
                                        id="horaVisita"
                                        type="time"
                                        class="form-control shadow-xs"
                                        bind:value={form.hora}
                                        required
                                    />
                                    <div class="form-text fs-8 text-muted">
                                        Hora de inicio programada.
                                    </div>
                                </div>

                                <!-- 6. DIRECCIÓN -->
                                <div class="col-12 col-md-6">
                                    <label
                                        for="direccionVisita"
                                        class="form-label fw-semibold text-dark fs-7"
                                    >
                                        <i
                                            class="fa fa-location-dot text-primary me-1"
                                        ></i> Dirección:
                                    </label>
                                    <input
                                        id="direccionVisita"
                                        type="text"
                                        class="form-control shadow-xs"
                                        placeholder="Ej: Av. Providencia 1234"
                                        bind:value={form.direccion}
                                    />
                                    <div class="form-text fs-8 text-muted">
                                        Ubicación física del cliente.
                                    </div>
                                </div>

                                <!-- 7. CONTACTO / TELÉFONO -->
                                <div class="col-12 col-md-6">
                                    <label
                                        for="contactoVisita"
                                        class="form-label fw-semibold text-dark fs-7"
                                    >
                                        <i
                                            class="fa fa-id-card text-primary me-1"
                                        ></i> Contacto y Teléfono:
                                    </label>
                                    <input
                                        id="contactoVisita"
                                        type="text"
                                        class="form-control shadow-xs"
                                        placeholder="Persona de contacto y teléfono"
                                        bind:value={form.contacto}
                                    />
                                    <div class="form-text fs-8 text-muted">
                                        {form.telefono ||
                                            "Contacto clave en empresa"}
                                    </div>
                                </div>

                                <!-- 8. OBJETIVO / MOTIVO -->
                                <div class="col-12">
                                    <label
                                        for="objetivoVisita"
                                        class="form-label fw-semibold text-dark fs-7"
                                    >
                                        <i
                                            class="fa fa-bullseye text-primary me-1"
                                        ></i> Objetivo / Motivo de la Visita:
                                    </label>
                                    <input
                                        id="objetivoVisita"
                                        type="text"
                                        class="form-control shadow-xs"
                                        placeholder="Ej: Presentación de propuesta comercial, demostración, cierre..."
                                        bind:value={form.objetivo}
                                    />
                                </div>

                                <!-- 9. OBSERVACIONES / NOTAS -->
                                <div class="col-12">
                                    <label
                                        for="notasVisita"
                                        class="form-label fw-semibold text-dark fs-7"
                                    >
                                        <i
                                            class="fa fa-note-sticky text-primary me-1"
                                        ></i> Observaciones / Notas para el vendedor:
                                    </label>
                                    <textarea
                                        id="notasVisita"
                                        class="form-control shadow-xs fs-7"
                                        rows="2"
                                        placeholder="Detalles adicionales, recordatorios, antecedentes relevantes..."
                                        bind:value={form.notas}></textarea>
                                </div>
                            </div>
                        </div>

                        <!-- Modal Footer -->
                        <div
                            class="modal-footer bg-white border-top py-2.5 px-4 d-flex justify-content-between align-items-center"
                        >
                            <button
                                type="button"
                                class="btn btn-outline-secondary btn-sm px-3"
                                on:click={closeModal}
                            >
                                <i class="fa fa-times me-1"></i> Cancelar
                            </button>

                            <button
                                type="submit"
                                class="btn btn-primary btn-sm px-4 fw-semibold d-inline-flex align-items-center gap-2 shadow-sm"
                            >
                                <i
                                    class="fa {isEditing
                                        ? 'fa-check'
                                        : 'fa-calendar-plus'}"
                                ></i>
                                <span
                                    >{isEditing
                                        ? "Guardar Cambios"
                                        : "Programar Visita"}</span
                                >
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    {/if}

    <!-- BARRA DE FILTROS Y ORDENAMIENTO -->
    <div class="card border-0 shadow-sm mb-4 filter-bar-card">
        <div class="card-body p-3">
            <div class="row g-2 align-items-center">
                <!-- Buscador rápido -->
                <div class="col-12 col-md-4 col-xl-3">
                    <div class="input-group input-group-sm">
                        <span class="input-group-text bg-white border-end-0">
                            <i class="fa fa-search text-muted"></i>
                        </span>
                        <input
                            type="text"
                            class="form-control border-start-0"
                            placeholder="Buscar cliente, vendedor..."
                            bind:value={searchTerm}
                        />
                        {#if searchTerm}
                            <button
                                class="btn btn-outline-secondary border-start-0"
                                type="button"
                                title="Limpiar búsqueda"
                                aria-label="Limpiar búsqueda"
                                on:click={() => (searchTerm = "")}
                            >
                                <i class="fa fa-times"></i>
                            </button>
                        {/if}
                    </div>
                </div>

                <!-- Filtro por Vendedor -->
                <div class="col-6 col-md-3 col-xl-3">
                    <div class="input-group input-group-sm">
                        <span class="input-group-text bg-white">
                            <i class="fa fa-user-tie text-muted"></i>
                        </span>
                        <select class="form-select" bind:value={filterVendedor}>
                            <option value="ALL">Todos los Vendedores</option>
                            {#each vendedores as vend}
                                <option value={vend.id}>{vend.full_name}</option
                                >
                            {/each}
                        </select>
                    </div>
                </div>

                <!-- Filtro por Tipo -->
                <div class="col-6 col-md-2 col-xl-2">
                    <select
                        class="form-select form-select-sm"
                        bind:value={filterTipo}
                    >
                        <option value="ALL">Todos los Tipos</option>
                        <option value="CRM_CUSTOMER">Clientes CRM</option>
                        <option value="PROSPECT">Prospectos</option>
                    </select>
                </div>

                <!-- Filtro por Estado -->
                <div class="col-6 col-md-3 col-xl-2">
                    <select
                        class="form-select form-select-sm"
                        bind:value={filterStatus}
                    >
                        <option value="ALL">Todos los Estados</option>
                        <option value="PROGRAMADA">Programadas</option>
                        <option value="REALIZADA">Realizadas</option>
                        <option value="CANCELADA">Canceladas</option>
                    </select>
                </div>

                <!-- Toggle de Orden por Fecha -->
                <div class="col-6 col-md-12 col-xl-2 text-md-end">
                    <button
                        class="btn btn-sm btn-outline-secondary w-100 d-flex align-items-center justify-content-center gap-1.5"
                        on:click={() =>
                            (sortDirection =
                                sortDirection === "asc" ? "desc" : "asc")}
                        title="Cambiar orden por fecha"
                    >
                        <i
                            class="fa {sortDirection === 'asc'
                                ? 'fa-arrow-down-short-wide'
                                : 'fa-arrow-up-wide-short'} text-primary"
                        ></i>
                        <span class="fs-8">
                            {sortDirection === "asc"
                                ? "Fecha más próxima"
                                : "Fecha más lejana"}
                        </span>
                    </button>
                </div>
            </div>
        </div>
    </div>

    <!-- ENCABEZADO DE LISTADO Y CONTADOR -->
    <div class="d-flex align-items-center justify-content-between mb-3">
        <div class="d-flex align-items-center gap-2">
            <h5 class="fw-bold text-gray-800 mb-0">Visitas del Programa</h5>
            <span
                class="badge bg-secondary-subtle text-secondary-emphasis rounded-pill px-2.5"
            >
                {sortedVisits.length}
                {sortedVisits.length === 1 ? "visita" : "visitas"}
            </span>
        </div>

        <div class="text-muted fs-8">
            <i class="fa fa-arrow-down-a-z text-primary me-1"></i>
            Ordenadas por fecha y hora cronológicamente
        </div>
    </div>

    <!-- TARJETAS DE VISITAS ORDENADAS POR FECHA -->
    {#if sortedVisits.length === 0}
        <div class="card border-0 shadow-sm py-5 text-center">
            <div class="card-body">
                <div class="empty-state-icon mb-3 text-muted">
                    <i class="fa fa-calendar-xmark fa-3x"></i>
                </div>
                <h5 class="fw-bold text-dark">
                    No se encontraron visitas programadas
                </h5>
                <p class="text-secondary small mb-3">
                    {#if searchTerm || filterVendedor !== "ALL" || filterTipo !== "ALL" || filterStatus !== "ALL"}
                        No hay resultados que coincidan con los filtros
                        seleccionados.
                    {:else}
                        Comienza programando una nueva visita con el botón
                        superior.
                    {/if}
                </p>
                {#if searchTerm || filterVendedor !== "ALL" || filterTipo !== "ALL" || filterStatus !== "ALL"}
                    <button
                        class="btn btn-sm btn-outline-primary"
                        on:click={() => {
                            searchTerm = "";
                            filterVendedor = "ALL";
                            filterTipo = "ALL";
                            filterStatus = "ALL";
                        }}
                    >
                        <i class="fa fa-filter-circle-xmark me-1"></i> Limpiar Filtros
                    </button>
                {:else}
                    <button
                        class="btn btn-sm btn-primary d-inline-flex align-items-center gap-1.5"
                        on:click={openNewVisitModal}
                    >
                        <i class="fa fa-calendar-plus"></i>
                        <span>Programar Nueva Visita</span>
                    </button>
                {/if}
            </div>
        </div>
    {:else}
        <div class="row g-3">
            {#each sortedVisits as visit (visit.id)}
                <div class="col-12 col-md-6 col-xl-4">
                    <div
                        class="card h-100 visit-card shadow-sm border-0 {visit.status ===
                        'REALIZADA'
                            ? 'status-realizada'
                            : visit.status === 'CANCELADA'
                              ? 'status-cancelada'
                              : 'status-programada'}"
                    >
                        <!-- Header de la tarjeta -->
                        <div
                            class="card-header bg-white border-bottom-0 pt-3 px-3 pb-1"
                        >
                            <!-- Primera línea: Fecha y Hora programada -->
                            <div class="d-flex align-items-center gap-2 mb-2">
                                <span
                                    class="badge date-badge px-2.5 py-1.5 fs-7 fw-bold d-inline-flex align-items-center gap-1.5"
                                >
                                    <i class="fa fa-calendar-day"></i>
                                    {dayjs(visit.fecha).format("DD/MM/YYYY")}
                                </span>
                                <span
                                    class="badge time-badge px-2.5 py-1.5 fs-7 fw-semibold d-inline-flex align-items-center gap-1.5"
                                >
                                    <i class="fa fa-clock"></i>
                                    {visit.hora} hrs
                                </span>
                            </div>

                            <!-- Segunda línea: Tercer valor (Estado corregido y con alta legibilidad) y Tipo -->
                            <div
                                class="d-flex align-items-center justify-content-between pb-2 border-bottom border-light-subtle"
                            >
                                <div
                                    class="d-inline-flex align-items-center gap-1.5"
                                >
                                    <span class="fs-8 text-muted fw-semibold"
                                        >Estado:</span
                                    >
                                    {#if visit.status === "REALIZADA"}
                                        <span
                                            class="badge status-badge-realizada px-2.5 py-1 fs-8 fw-bold d-inline-flex align-items-center gap-1"
                                        >
                                            <i class="fa fa-circle-check"></i> Realizada
                                        </span>
                                    {:else if visit.status === "CANCELADA"}
                                        <span
                                            class="badge status-badge-cancelada px-2.5 py-1 fs-8 fw-bold d-inline-flex align-items-center gap-1"
                                        >
                                            <i class="fa fa-ban"></i> Cancelada
                                        </span>
                                    {:else}
                                        <span
                                            class="badge status-badge-programada px-2.5 py-1 fs-8 fw-bold d-inline-flex align-items-center gap-1"
                                        >
                                            <i class="fa fa-hourglass-half"></i>
                                            Programada
                                        </span>
                                    {/if}
                                </div>

                                {#if visit.tipo === "CRM_CUSTOMER"}
                                    <span
                                        class="badge bg-primary text-white border px-2 py-1 fs-8 fw-semibold flex-shrink-0"
                                        title="Cliente del CRM"
                                    >
                                        <i class="fa fa-shield-halved me-1"></i>
                                        CRM
                                    </span>
                                {:else}
                                    <span
                                        class="badge bg-warning text-dark border px-2 py-1 fs-8 fw-semibold flex-shrink-0"
                                        title="Prospecto en prospección"
                                    >
                                        <i class="fa fa-bullseye me-1"></i> Prospecto
                                    </span>
                                {/if}
                            </div>
                        </div>

                        <!-- Cuerpo de la tarjeta -->
                        <div class="card-body px-3 py-2">
                            <!-- Nombre del Cliente -->
                            <div class="mb-2">
                                <h6
                                    class="fw-bold text-dark mb-0 fs-6 text-truncate"
                                    title={visit.clienteName}
                                >
                                    <i
                                        class="fa fa-building text-secondary me-1"
                                    ></i>
                                    {visit.clienteName}
                                </h6>
                            </div>

                            <!-- Vendedor asignado -->
                            <div
                                class="vendedor-pill d-flex align-items-center gap-2 p-2 rounded-2 mb-2"
                            >
                                <div
                                    class="avatar-circle-sm bg-primary text-white"
                                >
                                    {visit.vendedorName}
                                </div>
                                <div class="overflow-hidden">
                                    <div
                                        class="fs-8 text-muted text-uppercase fw-semibold line-height-1"
                                    >
                                        Vendedor
                                    </div>
                                    <div
                                        class="fs-7 fw-bold text-gray-900 text-truncate"
                                    >
                                        {visit.vendedorName}
                                    </div>
                                </div>
                            </div>

                            <!-- Dirección y Contacto -->
                            {#if visit.direccion}
                                <div
                                    class="text-secondary fs-8 mb-1 d-flex align-items-start gap-1.5"
                                >
                                    <i
                                        class="fa fa-location-dot text-danger mt-1 flex-shrink-0"
                                    ></i>
                                    <span
                                        class="text-truncate-2"
                                        title={visit.direccion}
                                        >{visit.direccion}</span
                                    >
                                </div>
                            {/if}

                            {#if visit.contacto || visit.telefono}
                                <div
                                    class="text-secondary fs-8 mb-2 d-flex align-items-center gap-1.5"
                                >
                                    <i
                                        class="fa fa-user text-muted flex-shrink-0"
                                    ></i>
                                    <span class="text-truncate">
                                        {visit.contacto || ""}
                                        {#if visit.telefono}
                                            <span class="text-muted ms-1"
                                                >({visit.telefono})</span
                                            >
                                        {/if}
                                    </span>
                                </div>
                            {/if}

                            <!-- Objetivo / Observaciones -->
                            {#if visit.objetivo}
                                <div
                                    class="objetivo-box p-2 rounded-2 bg-light border-start border-3 border-primary mb-2"
                                >
                                    <div
                                        class="fs-8 fw-bold text-muted text-uppercase mb-0.5"
                                    >
                                        Objetivo
                                    </div>
                                    <div
                                        class="fs-8 text-dark text-truncate-2"
                                        title={visit.objetivo}
                                    >
                                        {visit.objetivo}
                                    </div>
                                </div>
                            {/if}

                            {#if visit.notas}
                                <div class="fs-8 text-muted fst-italic mb-2">
                                    <i
                                        class="fa fa-note-sticky me-1 text-warning"
                                    ></i>
                                    {visit.notas}
                                </div>
                            {/if}
                        </div>

                        <!-- Footer con acciones -->
                        <div
                            class="card-footer bg-white border-top px-3 py-2 d-flex align-items-center justify-content-between"
                        >
                            <!-- Botón de estado rápido -->
                            <div>
                                {#if visit.status === "PROGRAMADA"}
                                    <button
                                        class="btn btn-xs btn-outline-success d-inline-flex align-items-center gap-1"
                                        on:click={() =>
                                            handleToggleStatus(
                                                visit,
                                                "REALIZADA",
                                            )}
                                        title="Marcar visita como completada"
                                    >
                                        <i class="fa fa-check"></i>
                                        <span>Completar</span>
                                    </button>
                                {:else if visit.status === "REALIZADA"}
                                    <button
                                        class="btn btn-xs btn-outline-secondary d-inline-flex align-items-center gap-1"
                                        on:click={() =>
                                            handleToggleStatus(
                                                visit,
                                                "PROGRAMADA",
                                            )}
                                        title="Reabrir como programada"
                                    >
                                        <i class="fa fa-rotate-left"></i>
                                        <span>Reabrir</span>
                                    </button>
                                {:else}
                                    <button
                                        class="btn btn-xs btn-outline-primary d-inline-flex align-items-center gap-1"
                                        on:click={() =>
                                            handleToggleStatus(
                                                visit,
                                                "PROGRAMADA",
                                            )}
                                    >
                                        <i class="fa fa-rotate-left"></i>
                                        <span>Reactivar</span>
                                    </button>
                                {/if}
                            </div>

                            <!-- Acciones de edición y eliminación -->
                            <div class="d-flex align-items-center gap-1">
                                <button
                                    class="btn btn-xs btn-outline-primary"
                                    on:click={() => handleEditVisit(visit)}
                                    title="Editar datos de la visita"
                                >
                                    <i class="fa fa-pencil"></i>
                                </button>

                                <button
                                    class="btn btn-xs btn-outline-danger"
                                    on:click={() => handleDeleteVisit(visit)}
                                    title="Eliminar del programa"
                                >
                                    <i class="fa fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>

<style>
    .visit-page-container {
        width: 100%;
        max-width: 100%;
        font-family: inherit;
    }

    /* Fuentes y tamaños auxiliares */
    .fs-7 {
        font-size: 0.85rem;
    }
    .fs-8 {
        font-size: 0.75rem;
    }
    .tracking-wider {
        letter-spacing: 0.05em;
    }
    .line-height-1 {
        line-height: 1.1;
    }

    /* Botones extra pequeños */
    .btn-xs {
        padding: 0.2rem 0.5rem;
        font-size: 0.75rem;
        border-radius: 4px;
    }

    /* Sombras suaves */
    .shadow-xs {
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    }

    /* Tarjetas de Métricas */
    .metric-card {
        transition:
            transform 0.2s ease,
            box-shadow 0.2s ease;
        background: #ffffff;
    }
    .metric-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 14px rgba(0, 0, 0, 0.08) !important;
    }

    .metric-icon-box {
        width: 44px;
        height: 44px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    /* Modal Backdrop y animación */
    .modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background-color: rgba(15, 23, 42, 0.65);
        z-index: 1050;
        backdrop-filter: blur(2px);
    }

    .modal.show {
        z-index: 1055;
    }

    .header-icon-circle {
        width: 38px;
        height: 38px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1rem;
    }

    /* Barra de Filtros */
    .filter-bar-card {
        background: #ffffff;
        border-radius: 8px;
    }

    /* Tarjetas de Visitas */
    .visit-card {
        border-radius: 10px;
        transition: all 0.2s ease;
        background-color: #ffffff;
        border: 1px solid #e9ecef !important;
        position: relative;
        overflow: hidden;
    }

    .visit-card:hover {
        transform: translateY(-3px);
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08) !important;
        border-color: #cbd5e1 !important;
    }

    /* Bordes superiores según estado */
    .visit-card.status-programada {
        border-top: 3px solid #2563eb !important;
    }

    .visit-card.status-realizada {
        border-top: 3px solid #16a34a !important;
        opacity: 0.95;
    }

    .visit-card.status-cancelada {
        border-top: 3px solid #dc2626 !important;
        opacity: 0.75;
    }

    /* Badges de fecha y hora */
    .date-badge {
        background-color: #eff6ff;
        color: #52555a;
        border: 1px solid #bfdbfe;
    }

    .time-badge {
        background-color: #f1f5f9;
        color: #52555a;
        border: 1px solid #e2e8f0;
    }

    /* Badges de estado con alta legibilidad y contraste */
    .status-badge-programada {
        background-color: #dbeafe;
        color: #1e40af;
        border: 1px solid #93c5fd;
    }

    .status-badge-realizada {
        background-color: #dcfce7;
        color: #166534;
        border: 1px solid #86efac;
    }

    .status-badge-cancelada {
        background-color: #fee2e2;
        color: #991b1b;
        border: 1px solid #fca5a5;
    }

    /* Pills auxiliares */
    .vendedor-pill {
        background-color: #f8fafc;
        border: 1px solid #f1f5f9;
    }

    .avatar-circle-sm {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        font-size: 0.75rem;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }

    .objetivo-box {
        background-color: #f8fafc;
    }

    /* Truncado multi-línea */
    .text-truncate-2 {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }
</style>
