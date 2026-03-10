// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore, collection, addDoc, getDocs, doc, deleteDoc, getDoc, setDoc, query, orderBy } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBqmxpP-fH_Si7_XN8nQNDhLRgOHAmUnc0",
  authDomain: "my-store-app-14f06.firebaseapp.com",
  databaseURL: "https://my-store-app-14f06-default-rtdb.firebaseio.com",
  projectId: "my-store-app-14f06",
  storageBucket: "my-store-app-14f06.firebasestorage.app",
  messagingSenderId: "760197087911",
  appId: "1:760197087911:web:8dc522ed1a544b49df9182",
  measurementId: "G-3295PGXS0H"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Upload image to Firebase Storage
export async function uploadProductImage(file: File, productId: string): Promise<string> {
  const storageRef = ref(storage, `products/${productId}/${file.name}`);
  const snapshot = await uploadBytes(storageRef, file);
  const downloadURL = await getDownloadURL(snapshot.ref);
  return downloadURL;
}

// Upload multiple images and return their URLs
export async function uploadProductImages(files: File[], productId: string): Promise<string[]> {
  const uploadPromises = files.map((file, index) => {
    const storageRef = ref(storage, `products/${productId}/image_${index}_${Date.now()}`);
    return uploadBytes(storageRef, file).then(snapshot => getDownloadURL(snapshot.ref));
  });
  return Promise.all(uploadPromises);
}

// Add a product to Firestore
export async function addProductToFirestore(product: {
  name: string;
  description: string;
  price: number;
  category_id: string;
  images: string[];
  main_image_index: number;
}) {
  const docRef = await addDoc(collection(db, "products"), {
    name: product.name,
    description: product.description,
    price: product.price,
    category_id: product.category_id,
    images: product.images,
    main_image: product.images[product.main_image_index] || product.images[0] || null,
    created_at: new Date()
  });
  return docRef.id;
}

// Get all products from Firestore
export async function getProductsFromFirestore() {
  const q = query(collection(db, "products"), orderBy("created_at", "desc"));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

// Get single product from Firestore
export async function getProductFromFirestore(productId: string) {
  const docRef = doc(db, "products", productId);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() };
  }
  return null;
}

// Delete product from Firestore
export async function deleteProductFromFirestore(productId: string) {
  await deleteDoc(doc(db, "products", productId));
}

// Add category to Firestore
export async function addCategoryToFirestore(name: string) {
  const docRef = await addDoc(collection(db, "categories"), {
    name,
    created_at: new Date()
  });
  return docRef.id;
}

// Get all categories from Firestore
export async function getCategoriesFromFirestore() {
  const querySnapshot = await getDocs(collection(db, "categories"));
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

// Delete category from Firestore
export async function deleteCategoryFromFirestore(categoryId: string) {
  await deleteDoc(doc(db, "categories", categoryId));
}

// Add order to Firestore
export async function addOrderToFirestore(order: {
  customer_name: string;
  customer_phone: string;
  delivery_method: 'pickup' | 'delivery';
  total_price: number;
  items: { id: string; name: string; price: number; quantity: number }[];
}) {
  const docRef = await addDoc(collection(db, "orders"), {
    ...order,
    status: 'חדש',
    created_at: new Date().toISOString()
  });
  return docRef.id;
}

// Get all orders from Firestore
export async function getOrdersFromFirestore() {
  const q = query(collection(db, "orders"), orderBy("created_at", "desc"));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

// Get settings from Firestore
export async function getSettingsFromFirestore() {
  const docRef = doc(db, "settings", "store");
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return docSnap.data();
  }
  return null;
}

// Save settings to Firestore
export async function saveSettingsToFirestore(settings: {
  pickup_address: string;
  delivery_cost: string;
  bit_phone: string;
}) {
  await setDoc(doc(db, "settings", "store"), settings);
}

export { db, storage, analytics };
