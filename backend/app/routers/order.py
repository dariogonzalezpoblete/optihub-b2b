from fastapi import APIRouter, HTTPException, status
from app.schemas.order import OrderCreate
from app.database import supabase

router = APIRouter(
    prefix="/api/v1/pedidos",
    tags=["Pedidos"]
)

@router.post("/", status_code=status.HTTP_201_CREATED)
def crear_pedido(order_data: OrderCreate):
    # 1. Validar regla B2B: Mínimo 10 unidades
    total_unidades = sum(item.cantidad for item in order_data.items)
    if total_unidades < 10:
        raise HTTPException(
            status_code=400, 
            detail=f"El pedido debe contener al menos 10 unidades. Actualmente tienes {total_unidades}."
        )

    items_detalle = []
    monto_neto_total = 0
    monto_bruto_total = 0

    # 2. Consultar productos y calcular totales
    for item in order_data.items:
        response = supabase.table("marcos").select("*").eq("id_ext", item.id_ext).execute()
        if not response.data:
            raise HTTPException(
                status_code=404, 
                detail=f"Producto con id_ext '{item.id_ext}' no existe en la base de datos."
            )
        
        producto = response.data[0]

        precio_neto = producto.get("precio_neto_clp", 0)
        precio_bruto = producto.get("precio_bruto_clp", 0)
        subtotal_bruto = precio_bruto * item.cantidad

        monto_neto_total += precio_neto * item.cantidad
        monto_bruto_total += subtotal_bruto

        items_detalle.append({
            "id_ext": producto["id_ext"],
            "modelo": producto.get("modelo", ""),
            "marca": producto.get("marca", ""),
            "cantidad": item.cantidad,
            "precio_unitario_neto_clp": precio_neto,
            "precio_unitario_bruto_clp": precio_bruto,
            "subtotal_bruto_clp": subtotal_bruto
        })

    monto_iva_total = monto_bruto_total - monto_neto_total

    # 3. Payload de la cabecera del pedido (usuario_id en None)
    pedido_payload = {
        "usuario_id": None,
        "monto_neto_clp": monto_neto_total,
        "monto_iva_clp": monto_iva_total,
        "monto_total_clp": monto_bruto_total,
        "cantidad_total_unidades": total_unidades,
        "estado_pedido": "pendiente",
        "estado_pago": "pendiente",
        "metodo_pago": "transferencia",
        "direccion_envio": order_data.direccion_envio
    }

    try:
        res_pedido = supabase.table("pedidos").insert(pedido_payload).execute()
        if not res_pedido.data:
            raise HTTPException(status_code=500, detail="Error al registrar la orden.")

        pedido_id = res_pedido.data[0]["id"]

        # 4. Insertar detalle de items
        for item_det in items_detalle:
            item_det["pedido_id"] = pedido_id
            supabase.table("detalle_pedidos").insert(item_det).execute()

        return {
            "status": "success",
            "mensaje": "Pedido creado con éxito",
            "pedido_id": pedido_id,
            "total_unidades": total_unidades,
            "monto_total_clp": monto_bruto_total
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))