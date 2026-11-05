<script>
    import { onMount, onDestroy } from "svelte";
    import { DataTable } from "simple-datatables";
    import "simple-datatables/dist/style.css";
    import { secureStorage } from "../../lib/secureStore";
    import api from "../../lib/apis.js";
    import dayjs from "dayjs";
    import Swal from "sweetalert2";
    import { hasPermissionPrograms } from "../../lib/utils";
    import Page from "../../routes/+page.svelte";

    let viewMode = "list";
    let isEditing = false;
    let showDeleteModal = false;
    let itemIdToDelete = null;

    const userData = secureStorage.getItem("_us_");
    const schemaName = userData.schema;
    const author = userData.username;
    const CompanyId = String(userData.company);
    const rol = userData.rol_id;

    const getInitialForm = () => ({
        id: null,
        company_name: "",
        contact_name: "",
        phone: "",
        email: "",
        address: "",
        city: "",
        business_activity: "",
        status: "",
        assigned_seller_id: 0,
        converted_crm_customer_id: "",
        created_by: author,
        type: "",
        company_id: String(CompanyId),
    });

    let prospectForm = getInitialForm();

    let prospects = [];

    let prospectToDelete = null;

    // Lista de colegios obtenida desde la API
    let users = [];
    let empresas = [];
    // Formatear datos para Simple DataTable
    $: isUpdate = hasPermissionPrograms(rol, "prospect", "UPDATE");
    $: isDelete = hasPermissionPrograms(rol, "prospect", "DELETE");

    $: dtData = users.map((u) => {
        let acciones = `<div class="action-buttons-mini">`;
        if (isUpdate) {
            acciones += `<button class="btn-mini-custom edit" onclick="document.dispatchEvent(new CustomEvent('edit-prospect', {detail: ${u.id}}))" title="Editar">
                <i class="fa fa-pencil"></i>
            </button>`;
        }
        if (isDelete) {
            acciones += `<button class="btn-mini-custom delete" onclick="document.dispatchEvent(new CustomEvent('delete-prospect', {detail: ${u.id}}))" title="Eliminar">
                <i class="fa fa-trash"></i>
            </button>`;
        }
        acciones += `</div>`;
        return [
            u.company_name,
            u.contact_name,
            u.business_activity,
            u.status,
            u.CreatedAt
                ? dayjs(u.CreatedAt).format("DD/MM/YYYY HH:mm")
                : "Reciente",
            u.created_by,
            acciones,
        ];
    });

    let dataTableInstance = null;
    // Directiva para DataTable
    function initDataTable(node, dataConfig) {
        if (dataTableInstance) dataTableInstance.destroy();
        dataTableInstance = new DataTable(node, {
            searchable: true,
            sortable: true,
            perPage: 10,
            labels: {
                placeholder: "Buscar usuarios...",
                perPage: "por página",
                noRows: "No se encontraron usuarios",
                info: "Mostrando {start} a {end} de {rows} usuarios",
                noResults: "No se encontraron usuarios",
            },
            data: {
                headings: [
                    "Compañia",
                    "Contacto",
                    "Actividad",
                    "Estado",
                    "Fecha Actualización",
                    "Modificador",
                    "Acciones",
                ],
                data: dataConfig,
            },
        });
        if (dataTableInstance.wrapperDOM) {
            dataTableInstance.wrapperDOM.style.fontSize = "13px";
        }
        return {
            destroy() {
                if (dataTableInstance) {
                    dataTableInstance.destroy();
                    dataTableInstance = null;
                }
            },
        };
    }

    const fetchData = async () => {
        try {
            const [prospectRes, comRes] = await Promise.all([
                api.getData(
                    "prospect",
                    "",
                    `company_id=${CompanyId}`,
                    "",
                    schemaName,
                ),
                api.getData("company", "", `id=${CompanyId}`, "", "salesvisit"),
            ]);
            if (prospectRes.status === "success")
                prospects = Array.isArray(prospectRes.data)
                    ? prospectRes.data
                    : [];
            if (comRes.status === "success")
                empresas = Array.isArray(comRes.data) ? comRes.data : [];
            // El filtrado es ahora reactivo ($:)
        } catch (error) {
            console.error("Error al cargar datos:", error);
        }
    };

    onMount(() => {
        fetchData();
        document.addEventListener("edit-prospect", handleEdit);
        document.addEventListener("delete-prospect", handleDelete);
        document.addEventListener("click", handleTableClick);
    });

    onDestroy(() => {
        document.removeEventListener("edit-prospect", handleEdit);
        document.removeEventListener("delete-prospect", handleDelete);
        document.removeEventListener("click", handleTableClick);
    });

    async function handleEdit(event) {
        const usersid = event.detail;
        const data = await api.getData("users", "", "", usersid, schemaName);

        if (data.status === "success") {
            if (data.data) {
                prospectForm = { ...data.data };
                if (prospectForm.company_id)
                    prospectForm.company_id = String(prospectForm.company_id);
                isEditing = true;
                viewMode = "form";
            }
        }
    }

    async function handleDelete(event) {
        console.log("Eliminando prospecto:", event.detail);
        const usersid = event.detail;
        const data = await api.getData("prospect", "", "", usersid, schemaName);

        if (data.status === "success") {
            prospectToDelete = data.data;
            showDeleteModal = true;
        }
    }

    function handleTableClick(e) {
        const target = e.target.closest("button");
        if (!target) return;
        const id = target.getAttribute("data-id");
        const action = target.getAttribute("data-action");
        if (!id || !action) return;
        if (action === "toggle-status") handleToggleStatus(id);
    }

    async function handleToggleStatus(prospectid) {
        if (!isUpdate) return;

        // Obtenemos los datos completos primero para no sobreescribir con datos parciales
        const data = await api.getData(
            "prospect",
            "",
            "",
            prospectid,
            schemaName,
        );
        if (data.status !== "success" || !data.data) {
            Swal.fire(
                "Error",
                "No se pudo obtener la información del usuario",
                "error",
            );
            return;
        }
        console.log("USUARIO A EDITAR", data.data);
        const user = data.data;
        const newStatus = Number(user.active) === 1 ? 2 : 1;

        const payload = {
            active: newStatus,
            author: author,
        };

        try {
            const res = await api.updateData(
                "prospect",
                payload,
                "",
                prospectid,
                schemaName,
            );
            console.log("RES", res);
            if (res.status === "success") {
                fetchData();
            } else {
                Swal.fire(
                    "Error",
                    res.message || "No se pudo cambiar el estado",
                    "error",
                );
            }
        } catch (error) {
            console.error("Error al cambiar estado:", error);
        }
    }
    async function confirmDelete() {
        if (!prospectToDelete) {
            console.error("No hay usuario seleccionado para eliminar");
            return;
        }
        const data = await api.deleteData(
            "users",
            "",
            "",
            prospectToDelete.id,
            schemaName,
        );

        if (data.status === "success") {
            Swal.fire(
                "Eliminado",
                "El usuario se eliminó correctamente.",
                "success",
            );
            showDeleteModal = false;
            fetchData();
        } else {
            Swal.fire(
                "Error",
                "Error al eliminar: " + (data.message || "Error desconocido"),
                "error",
            );
        }
    }

    function openCreateForm() {
        prospectForm = getInitialForm();
        isEditing = false;
        viewMode = "form";
    }

    function returnToList() {
        viewMode = "list";
    }

    async function saveForm() {
        let data;
        const payload = {
            ...prospectForm,
            status: prospectForm.status,
            created_by: author,
            company_id: Number(prospectForm.company_id),
        };
        if (isEditing) {
            data = await api.updateData(
                "prospect",
                payload,
                "",
                prospectForm.id,
                schemaName,
            );
        } else {
            data = await api.setData("prospect", payload, "", "", schemaName);
        }

        if (data.status === "success") {
            Swal.fire(
                "Guardado",
                `El prospecto se ha ${isEditing ? "actualizado" : "creado"} correctamente.`,
                "success",
            );
            fetchData();
            viewMode = "list";
        } else {
            Swal.fire("Error", data.message, "error");
        }
    }
</script>

<div class="page-wrapper">
    {#if viewMode === "list"}
        <div class="card main-card shadow-sm border-0 mb-4">
            <div class="card-header-flex p-4">
                <div class="title-group">
                    <div class="title-with-icon">
                        <i class="fa fa-users icon-main text-primary"></i>
                        <h2 class="m-0">Gestión de Prospectos y Clientes</h2>
                    </div>
                    <p class="subtitle mt-1 mb-0">
                        Administra los prospectos y clientes del crm.
                    </p>
                </div>
                {#if hasPermissionPrograms(rol, "users", "INSERT")}
                    <button class="btn-new" on:click={openCreateForm}>
                        <i class="fa fa-plus"></i> Nuevo Cliente/Prospecto
                    </button>
                {/if}
            </div>
            <div class="table-container p-3 pt-0">
                {#key dtData}
                    <table
                        use:initDataTable={dtData}
                        class="table table-hover w-100"
                    ></table>
                {/key}
            </div>
        </div>
    {:else}
        <Page></Page>
    {/if}
</div>
