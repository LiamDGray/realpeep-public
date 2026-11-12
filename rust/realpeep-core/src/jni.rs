//! Minimal JNI surface for the Android app.
//!
//! The Kotlin `NativeCore` class loads these symbols. All inputs are checked
//! and errors return null; the Kotlin side falls back to its pure-Java
//! implementation when the library is unavailable.

use jni::objects::{JByteArray, JClass, JObjectArray};
use jni::sys::jbyteArray;
use jni::JNIEnv;

use crate::{merkle_root, sha256, Hash32};

fn read_32(env: &mut JNIEnv, array: &JByteArray) -> Option<[u8; 32]> {
    let bytes = env.convert_byte_array(array).ok()?;
    bytes.try_into().ok()
}

#[allow(unsafe_code)]
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_realpeep_app_crypto_NativeCore_sha256(
    env: JNIEnv,
    _class: JClass,
    data: JByteArray,
) -> jbyteArray {
    let Ok(bytes) = env.convert_byte_array(&data) else {
        return std::ptr::null_mut();
    };
    match env.byte_array_from_slice(&sha256(&bytes)) {
        Ok(array) => array.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}

#[allow(unsafe_code)]
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_realpeep_app_crypto_NativeCore_frameHash(
    mut env: JNIEnv,
    _class: JClass,
    previous: JByteArray,
    frame: JByteArray,
) -> jbyteArray {
    let (Some(prev), Ok(frame)) = (read_32(&mut env, &previous), env.convert_byte_array(&frame))
    else {
        return std::ptr::null_mut();
    };
    let mut input = Vec::with_capacity(32 + frame.len());
    input.extend_from_slice(&prev);
    input.extend_from_slice(&frame);
    match env.byte_array_from_slice(&sha256(&input)) {
        Ok(array) => array.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}

#[allow(unsafe_code)]
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_realpeep_app_crypto_NativeCore_merkleRoot(
    mut env: JNIEnv,
    _class: JClass,
    leaves: JObjectArray,
) -> jbyteArray {
    let Ok(length) = env.get_array_length(&leaves) else {
        return std::ptr::null_mut();
    };
    let mut hashes: Vec<Hash32> = Vec::with_capacity(length as usize);
    for index in 0..length {
        let Ok(value) = env.get_object_array_element(&leaves, index) else {
            return std::ptr::null_mut();
        };
        let array = JByteArray::from(value);
        let Some(hash) = read_32(&mut env, &array) else {
            return std::ptr::null_mut();
        };
        hashes.push(hash);
    }
    match env.byte_array_from_slice(&merkle_root(&hashes)) {
        Ok(array) => array.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}
