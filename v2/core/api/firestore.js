import { collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db } from "../firebase/app.js";

export function collectionRef(name) {
  return collection(db, name);
}

export function documentRef(collectionName, id) {
  return doc(db, collectionName, id);
}

export function getDocument(collectionName, id) {
  return getDoc(documentRef(collectionName, id));
}

export function getCollection(collectionName) {
  return getDocs(collectionRef(collectionName));
}

export function addDocument(collectionName, data) {
  return addDoc(collectionRef(collectionName), data);
}

export function updateDocument(collectionName, id, data) {
  return updateDoc(documentRef(collectionName, id), data);
}

export function deleteDocument(collectionName, id) {
  return deleteDoc(documentRef(collectionName, id));
}

export { query, orderBy, limit };
