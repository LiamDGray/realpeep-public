# RealPeep ProGuard rules
# Keep BouncyCastle Ed25519
-keep class org.bouncycastle.** { *; }
-dontwarn org.bouncycastle.**
