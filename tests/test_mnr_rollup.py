from realpeep.mnr_rollup import MNRReceipt, MNRServer, ZKPayload


def test_mnr_server_rejects_unentangled_payloads():
    server = MNRServer()
    
    # Device A uploads a payload but it contains NO captured keys
    payload_a = ZKPayload(
        device_id="DEV_A", 
        ephemeral_key="PK_A_123", 
        captured_keys=[]
    )
    
    # Device B uploads a payload but it contains NO captured keys
    payload_b = ZKPayload(
        device_id="DEV_B", 
        ephemeral_key="PK_B_456", 
        captured_keys=[]
    )
    
    server.receive_payload(payload_a)
    server.receive_payload(payload_b)
    
    # Attempt to rollup A and B
    result = server.attempt_retroactive_rollup("PK_A_123", "PK_B_456")
    assert result.success is False
    assert "No mutual entanglement found" in result.reason

def test_mnr_server_accepts_mutually_entangled_payloads():
    server = MNRServer()
    
    # A captured B's key, B captured A's key
    payload_a = ZKPayload(
        device_id="DEV_A", 
        ephemeral_key="PK_A_123", 
        captured_keys=["PK_B_456"]
    )
    
    payload_b = ZKPayload(
        device_id="DEV_B", 
        ephemeral_key="PK_B_456", 
        captured_keys=["PK_A_123"]
    )
    
    server.receive_payload(payload_a)
    server.receive_payload(payload_b)
    
    # Simulate devices signing the MNR receipt (Zhou-Gollmann style handshake)
    receipt_a = MNRReceipt(device_id="DEV_A", target_key="PK_B_456", signature="SIG_A")
    receipt_b = MNRReceipt(device_id="DEV_B", target_key="PK_A_123", signature="SIG_B")
    
    server.receive_receipt(receipt_a)
    server.receive_receipt(receipt_b)
    
    result = server.attempt_retroactive_rollup("PK_A_123", "PK_B_456")
    assert result.success is True
    assert result.certificate_id is not None
    assert "Mutual Non-Repudiation Established" in result.reason
