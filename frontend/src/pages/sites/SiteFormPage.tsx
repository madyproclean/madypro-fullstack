import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { ChipGroup } from '../../components/ui/ChipGroup';
import { Modal, ModalHeader, ModalBody } from '../../components/ui/Modal';
import { Tabs, TabPanel } from '../../components/ui/Tabs';
import { PhotoGrid } from '../../components/ui/PhotoGrid';
import { compressImageFile } from '../../utils/image';
import { SitesTable } from './SitesTable';
import { useAuthContext } from '../../context/AuthContext';
import {
  createSite,
  getSite,
  SitePayload,
  updateSite,
  listSiteContracts,
  createSiteContract,
  deleteSiteContract,
  listSiteZones,
  createSiteZone,
  updateSiteZone,
  deleteSiteZone,
  setSitePlanImage,
  getSiteIncidents,
  getSiteQualityScore,
  getSiteQrCode,
  sendSitePlanning,
  listSiteCategories,
  addSiteCategory,
  removeSiteCategory,
  createSiteCategoryChecklistItem,
  removeSiteCategoryChecklistItem,
} from '../../services/api/sites.api';
import { listInventory, createInventoryItem, adjustInventoryItem, deleteInventoryItem } from '../../services/api/inventory.api';
import { listCategories } from '../../services/api/categories.api';
import { getSiteRoster } from '../../services/api/interventions.api';
import { SiteContract, SiteZone, SiteIncident, SiteQualityScore, SiteQrCode } from '../../types/siteAdvanced';
import { InventoryItem } from '../../types/inventory';
import { InterventionCategory, SiteCategory, SiteRoster } from '../../types/category';
import { listUsers } from '../../services/api/users.api';
import { env } from '../../config/env';
import {
  Pencil,
  Plus,
  Minus,
  RotateCcw,
  Send,
  Trash2,
  Printer,
  Save,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

const DAY_LABELS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

const STATUS_OPTIONS = [
  { value: 'true', label: 'Actif' },
  { value: 'false', label: 'Inactif' },
];

const CREATE_TABS = [
  { id: 'general', label: 'Informations générales' },
  { id: 'access', label: 'Accès & contacts' },
  { id: 'gps', label: 'Règles de pointage' },
  { id: 'categories', label: 'Catégories & tâches' },
  { id: 'contracts', label: 'Contrats' },
  { id: 'zones', label: 'Zones du site' },
  { id: 'inventory', label: 'Inventaire' },
];

const EDIT_ONLY_TABS = [
  { id: 'roster', label: 'Équipe' },
  { id: 'qr', label: 'QR code' },
];

type SupervisorOption = {
  id: string;
  name: string;
};

type AddressSuggestion = {
  id: string;
  label: string;
  longitude?: number;
  latitude?: number;
};

type FormState = {
  name: string;
  address: string;
  timeWindow: string;
  latitude: string;
  longitude: string;
  active: 'true' | 'false';
  accessInstructions: string;
  accessCode: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  gpsDistanceMeters: string;
  toleranceMinutes: string;
  minimumDurationMinutes: string;
};

const INITIAL_FORM: FormState = {
  name: '',
  address: '',
  timeWindow: '',
  latitude: '',
  longitude: '',
  active: 'true',
  accessInstructions: '',
  accessCode: '',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  gpsDistanceMeters: '',
  toleranceMinutes: '',
  minimumDurationMinutes: '',
};

export const SiteFormPage: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams<{ id?: string }>();
  const siteId = params.id;
  const isEdit = Boolean(siteId);
  const { token, notify } = useAuthContext();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [supervisors, setSupervisors] = useState<SupervisorOption[]>([]);
  const [selectedSupervisors, setSelectedSupervisors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [addressSelected, setAddressSelected] = useState(false);
  const mapboxToken = env.mapboxToken;
  const [formVisible, setFormVisible] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState('general');
  const [maxUnlockedIndex, setMaxUnlockedIndex] = useState(0);
  const [siteCategories, setSiteCategories] = useState<SiteCategory[]>([]);
  const [categoryCatalog, setCategoryCatalog] = useState<InterventionCategory[]>([]);
  const [newSiteCategory, setNewSiteCategory] = useState({ categoryId: '', startTime: '08:00', endTime: '10:00' });
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [newChecklistLabelByCategory, setNewChecklistLabelByCategory] = useState<Record<string, string>>({});
  const [roster, setRoster] = useState<SiteRoster | null>(null);
  const [contracts, setContracts] = useState<SiteContract[]>([]);
  const [newContract, setNewContract] = useState({ label: '', startDate: '', endDate: '', slaDetails: '' });
  const [zones, setZones] = useState<SiteZone[]>([]);
  const [newZone, setNewZone] = useState({ label: '', floor: '' });
  const [planImageUrl, setPlanImageUrl] = useState<string | null>(null);
  const [sitePhotos, setSitePhotos] = useState<string[]>([]);
  const [incidents, setIncidents] = useState<SiteIncident[]>([]);
  const [qualityScore, setQualityScore] = useState<SiteQualityScore | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [newInventoryItem, setNewInventoryItem] = useState({ name: '', barcode: '', unit: '', quantity: '0', minThreshold: '0' });
  const [qrCode, setQrCode] = useState<SiteQrCode | null>(null);
  const [planningPeriodWeeks, setPlanningPeriodWeeks] = useState('4');
  const [sendingPlanning, setSendingPlanning] = useState(false);

  // Étapes "Catégories/Contrats/Zones/Inventaire" en création : rien n'existe encore
  // en base (pas de siteId), on garde donc les saisies en mémoire et on les
  // enregistre juste après la création réelle du site (voir handleSubmit).
  type StagedCategory = { categoryId: string; label: string; startTime: string; endTime: string; checklist: string[] };
  const [stagedCategories, setStagedCategories] = useState<StagedCategory[]>([]);
  const [stagedContracts, setStagedContracts] = useState<{ label: string; startDate: string; endDate: string; slaDetails?: string }[]>([]);
  const [stagedZones, setStagedZones] = useState<{ label: string; floor?: string }[]>([]);
  const [stagedInventory, setStagedInventory] = useState<{ name: string; barcode?: string; unit?: string; quantity: number; minThreshold: number }[]>([]);
  const [stagedPlanImage, setStagedPlanImage] = useState<string | null>(null);
  const [stagedChecklistDraft, setStagedChecklistDraft] = useState<Record<number, string>>({});

  const loadSiteExtras = (currentSiteId: string) => {
    if (!token) return;
    listSiteContracts(token, currentSiteId).then(setContracts).catch(() => {});
    listSiteZones(token, currentSiteId).then(setZones).catch(() => {});
    getSiteIncidents(token, currentSiteId).then(setIncidents).catch(() => {});
    getSiteQualityScore(token, currentSiteId).then(setQualityScore).catch(() => {});
    listInventory(token, currentSiteId).then(setInventory).catch(() => {});
    getSiteQrCode(token, currentSiteId).then(setQrCode).catch(() => {});
    listSiteCategories(token, currentSiteId).then(setSiteCategories).catch(() => setSiteCategories([]));
    getSiteRoster(token, currentSiteId).then(setRoster).catch(() => setRoster(null));
  };

  useEffect(() => {
    if (!token) return;
    listCategories(token).then(setCategoryCatalog).catch(() => setCategoryCatalog([]));
  }, [token]);

  useEffect(() => {
    if (!token) {
      setError('Veuillez vous reconnecter pour gérer les sites.');
      return;
    }
    setLoading(true);
    const load = async () => {
      try {
        const [supervisorData, siteData] = await Promise.all([
          listUsers(token, { role: 'SUPERVISOR', status: 'active' }),
          siteId ? getSite(token, siteId) : Promise.resolve(null),
        ]);
        const supervisorItems = (supervisorData as any)?.items ?? (supervisorData as any) ?? [];
        const supervisorOptions: SupervisorOption[] = supervisorItems.map((user: any) => ({
          id: user.id,
          name: user.name,
        }));

        if (siteData) {
          const mergedSupervisors = [...supervisorOptions];
          siteData.supervisors.forEach((supervisor) => {
            if (!mergedSupervisors.some((option) => option.id === supervisor.id)) {
              mergedSupervisors.push({ id: supervisor.id, name: supervisor.name });
            }
          });
          setSupervisors(mergedSupervisors);
          setForm({
            name: siteData.name,
            address: siteData.address,
            timeWindow: siteData.timeWindow ?? '',
            latitude: typeof siteData.latitude === 'number' ? String(siteData.latitude) : '',
            longitude: typeof siteData.longitude === 'number' ? String(siteData.longitude) : '',
            active: siteData.active ? 'true' : 'false',
            accessInstructions: siteData.accessInstructions ?? '',
            accessCode: siteData.accessCode ?? '',
            contactName: siteData.contactName ?? '',
            contactPhone: siteData.contactPhone ?? '',
            contactEmail: siteData.contactEmail ?? '',
            gpsDistanceMeters:
              typeof siteData.gpsDistanceMeters === 'number' ? String(siteData.gpsDistanceMeters) : '',
            toleranceMinutes:
              typeof siteData.toleranceMinutes === 'number' ? String(siteData.toleranceMinutes) : '',
            minimumDurationMinutes:
              typeof siteData.minimumDurationMinutes === 'number' ? String(siteData.minimumDurationMinutes) : '',
          });
          setSelectedSupervisors(siteData.supervisorIds);
          setPlanImageUrl((siteData as any).planImageUrl ?? null);
          setSitePhotos(siteData.photos ?? []);
          setFormVisible(true);
          loadSiteExtras(siteData.id);
        } else {
          setSupervisors(supervisorOptions);
          setForm(INITIAL_FORM);
          setSelectedSupervisors([]);
          // en création, on ouvre la modale directement pour aligner avec l'édition
          setFormVisible(true);
        }
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Impossible de charger les informations superviseurs.';
        setError(message);
        notify(message, 'error');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [token, notify, siteId]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (name === 'address') {
      setAddressError(null);
      setAddressSelected(false);
    }
  };

  useEffect(() => {
    if (!mapboxToken) {
      setAddressSuggestions([]);
      setAddressError('Clé Mapbox absente : définissez VITE_MAPBOX_TOKEN dans web/.env ou .env.local');
      return;
    }
    if (addressSelected) {
      setAddressSuggestions([]);
      return;
    }
    const query = form.address.trim();
    if (query.length < 3) {
      setAddressSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setAddressLoading(true);
      setAddressError(null);
      try {
        const url = new URL(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`,
        );
        url.searchParams.set('access_token', mapboxToken);
        url.searchParams.set('autocomplete', 'true');
        url.searchParams.set('limit', '5');
        url.searchParams.set('country', 'fr');
        const response = await fetch(url.toString(), { signal: controller.signal });
        if (!response.ok) {
          throw new Error('Adresse introuvable');
        }
        const data = await response.json();
        const suggestions: AddressSuggestion[] = (data.features ?? []).map((feature: any) => ({
          id: feature.id,
          label: feature.place_name,
          longitude: feature.center?.[0],
          latitude: feature.center?.[1],
        }));
        setAddressSuggestions(suggestions);
      } catch (fetchError) {
        if ((fetchError as Error).name === 'AbortError') return;
        const message =
          fetchError instanceof Error ? fetchError.message : 'Impossible de récupérer les suggestions.';
        setAddressError(`Erreur récupération adresses : ${message}`);
        setAddressSuggestions([]);
      } finally {
        setAddressLoading(false);
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [form.address, mapboxToken, addressSelected]);

  const handleAddressSelection = (suggestion: AddressSuggestion) => {
    setForm((prev) => ({
      ...prev,
      address: suggestion.label,
      latitude: typeof suggestion.latitude === 'number' ? String(suggestion.latitude) : prev.latitude,
      longitude:
        typeof suggestion.longitude === 'number' ? String(suggestion.longitude) : prev.longitude,
    }));
    setAddressSelected(true);
    setAddressSuggestions([]);
  };

  const isInvalid = !form.name || !form.address || !token;

  const isStepValid = (stepId: string) => {
    if (stepId === 'general') return Boolean(form.name.trim() && form.address.trim());
    return true;
  };

  const persistStagedExtras = async (newSiteId: string): Promise<string[]> => {
    if (!token) return [];
    const failures: string[] = [];
    for (const cat of stagedCategories) {
      try {
        const sc = await addSiteCategory(token, newSiteId, {
          categoryId: cat.categoryId,
          startTime: cat.startTime,
          endTime: cat.endTime,
        });
        for (const label of cat.checklist) {
          await createSiteCategoryChecklistItem(token, newSiteId, sc.id, { label });
        }
      } catch {
        failures.push(`catégorie ${cat.label}`);
      }
    }
    for (const contract of stagedContracts) {
      try {
        await createSiteContract(token, newSiteId, contract);
      } catch {
        failures.push(`contrat ${contract.label}`);
      }
    }
    for (const zone of stagedZones) {
      try {
        await createSiteZone(token, newSiteId, zone);
      } catch {
        failures.push(`zone ${zone.label}`);
      }
    }
    for (const item of stagedInventory) {
      try {
        await createInventoryItem(token, { siteId: newSiteId, ...item });
      } catch {
        failures.push(`article ${item.name}`);
      }
    }
    if (stagedPlanImage) {
      try {
        await setSitePlanImage(token, newSiteId, stagedPlanImage);
      } catch {
        failures.push('plan des locaux');
      }
    }
    return failures;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || isInvalid) return;
    setSubmitting(true);
    setError(null);
    const latitude = form.latitude ? Number(form.latitude) : undefined;
    const longitude = form.longitude ? Number(form.longitude) : undefined;
    const payload: SitePayload = {
      name: form.name,
      address: form.address,
      timeWindow: form.timeWindow || undefined,
      latitude: Number.isFinite(latitude ?? NaN) ? latitude : undefined,
      longitude: Number.isFinite(longitude ?? NaN) ? longitude : undefined,
      active: form.active === 'true',
      supervisorIds: selectedSupervisors,
      accessInstructions: form.accessInstructions || undefined,
      accessCode: form.accessCode || undefined,
      contactName: form.contactName || undefined,
      contactPhone: form.contactPhone || undefined,
      contactEmail: form.contactEmail || undefined,
      gpsDistanceMeters: form.gpsDistanceMeters ? Number(form.gpsDistanceMeters) : undefined,
      toleranceMinutes: form.toleranceMinutes ? Number(form.toleranceMinutes) : undefined,
      minimumDurationMinutes: form.minimumDurationMinutes ? Number(form.minimumDurationMinutes) : undefined,
      photos: sitePhotos,
    };

    try {
      if (isEdit && siteId) {
        await updateSite(token, siteId, payload);
        notify('Site mis à jour avec succès');
        navigate('/sites');
      } else {
        const created = await createSite(token, payload);
        const failures = await persistStagedExtras(created.id);
        notify(
          failures.length
            ? `Site créé. Éléments non enregistrés (à ajouter depuis la fiche) : ${failures.join(', ')}`
            : 'Site créé avec succès',
          failures.length ? 'error' : undefined,
        );
        navigate(`/sites/${created.id}/edit`);
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : `Échec de la ${isEdit ? 'mise à jour' : 'création'} du site.`;
      setError(message);
      notify(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const reloadSiteCategories = () => {
    if (!token || !siteId) return;
    listSiteCategories(token, siteId).then(setSiteCategories).catch(() => {});
  };

  const handleAddSiteCategory = async () => {
    if (!newSiteCategory.categoryId) return;
    if (!isEdit) {
      const catalogEntry = categoryCatalog.find((c) => c.id === newSiteCategory.categoryId);
      setStagedCategories((prev) => [
        ...prev,
        { ...newSiteCategory, label: catalogEntry?.label ?? '', checklist: [] },
      ]);
      setNewSiteCategory({ categoryId: '', startTime: '08:00', endTime: '10:00' });
      return;
    }
    if (!token || !siteId) return;
    setCategoryBusy(true);
    try {
      await addSiteCategory(token, siteId, newSiteCategory);
      setNewSiteCategory({ categoryId: '', startTime: '08:00', endTime: '10:00' });
      reloadSiteCategories();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Impossible d'ajouter cette catégorie.", 'error');
    } finally {
      setCategoryBusy(false);
    }
  };

  const handleRemoveSiteCategory = async (siteCategoryId: string) => {
    if (!token || !siteId) return;
    try {
      await removeSiteCategory(token, siteId, siteCategoryId);
      reloadSiteCategories();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Impossible de retirer cette catégorie.', 'error');
    }
  };

  const removeStagedCategory = (index: number) => {
    setStagedCategories((prev) => prev.filter((_, i) => i !== index));
    setStagedChecklistDraft((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  const handleAddCategoryChecklistItem = async (siteCategoryId: string) => {
    if (!token || !siteId) return;
    const label = (newChecklistLabelByCategory[siteCategoryId] ?? '').trim();
    if (!label) return;
    try {
      await createSiteCategoryChecklistItem(token, siteId, siteCategoryId, { label });
      setNewChecklistLabelByCategory((prev) => ({ ...prev, [siteCategoryId]: '' }));
      reloadSiteCategories();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Impossible d'ajouter cet élément.", 'error');
    }
  };

  const handleRemoveCategoryChecklistItem = async (siteCategoryId: string, itemId: string) => {
    if (!token || !siteId) return;
    try {
      await removeSiteCategoryChecklistItem(token, siteId, siteCategoryId, itemId);
      reloadSiteCategories();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Impossible de supprimer cet élément.', 'error');
    }
  };

  const addStagedChecklistItem = (index: number) => {
    const label = (stagedChecklistDraft[index] ?? '').trim();
    if (!label) return;
    setStagedCategories((prev) => prev.map((cat, i) => (i === index ? { ...cat, checklist: [...cat.checklist, label] } : cat)));
    setStagedChecklistDraft((prev) => ({ ...prev, [index]: '' }));
  };

  const removeStagedChecklistItem = (index: number, itemIndex: number) => {
    setStagedCategories((prev) =>
      prev.map((cat, i) => (i === index ? { ...cat, checklist: cat.checklist.filter((_, j) => j !== itemIndex) } : cat)),
    );
  };

  const submitContract = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newContract.label.trim() || !newContract.startDate || !newContract.endDate) return;
    if (!isEdit) {
      setStagedContracts((prev) => [
        ...prev,
        {
          label: newContract.label.trim(),
          startDate: newContract.startDate,
          endDate: newContract.endDate,
          slaDetails: newContract.slaDetails || undefined,
        },
      ]);
      setNewContract({ label: '', startDate: '', endDate: '', slaDetails: '' });
      return;
    }
    if (!token || !siteId) return;
    try {
      await createSiteContract(token, siteId, {
        label: newContract.label.trim(),
        startDate: newContract.startDate,
        endDate: newContract.endDate,
        slaDetails: newContract.slaDetails || undefined,
      });
      setNewContract({ label: '', startDate: '', endDate: '', slaDetails: '' });
      loadSiteExtras(siteId);
      notify('Contrat ajouté');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Impossible d’ajouter', 'error');
    }
  };

  const removeContract = async (contractId: string) => {
    if (!token || !siteId) return;
    await deleteSiteContract(token, siteId, contractId).catch(() => {});
    loadSiteExtras(siteId);
  };

  const removeStagedContract = (index: number) => {
    setStagedContracts((prev) => prev.filter((_, i) => i !== index));
  };

  const submitZone = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newZone.label.trim()) return;
    if (!isEdit) {
      setStagedZones((prev) => [...prev, { label: newZone.label.trim(), floor: newZone.floor || undefined }]);
      setNewZone({ label: '', floor: '' });
      return;
    }
    if (!token || !siteId) return;
    try {
      await createSiteZone(token, siteId, { label: newZone.label.trim(), floor: newZone.floor || undefined });
      setNewZone({ label: '', floor: '' });
      loadSiteExtras(siteId);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Impossible d’ajouter', 'error');
    }
  };

  const toggleZoneCompleted = async (zone: SiteZone) => {
    if (!token || !siteId) return;
    await updateSiteZone(token, siteId, zone.id, { completed: !zone.completed }).catch(() => {});
    loadSiteExtras(siteId);
  };

  const removeZone = async (zoneId: string) => {
    if (!token || !siteId) return;
    await deleteSiteZone(token, siteId, zoneId).catch(() => {});
    loadSiteExtras(siteId);
  };

  const removeStagedZone = (index: number) => {
    setStagedZones((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePlanUpload = async (file: File) => {
    const reader = new FileReader();
    if (!isEdit) {
      reader.onload = () => setStagedPlanImage(reader.result as string);
      reader.readAsDataURL(file);
      return;
    }
    if (!token || !siteId) return;
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      try {
        await setSitePlanImage(token, siteId, dataUrl);
        setPlanImageUrl(dataUrl);
        notify('Plan mis à jour');
      } catch (err) {
        notify(err instanceof Error ? err.message : 'Envoi impossible', 'error');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSitePhotosUpload = (files: FileList) => {
    Promise.all(Array.from(files).map((file) => compressImageFile(file)))
      .then((base64) => setSitePhotos((prev) => [...prev, ...base64]))
      .catch(() => notify('Impossible de charger les photos', 'error'));
  };

  const submitInventoryItem = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newInventoryItem.name.trim()) return;
    if (!isEdit) {
      setStagedInventory((prev) => [
        ...prev,
        {
          name: newInventoryItem.name.trim(),
          barcode: newInventoryItem.barcode || undefined,
          unit: newInventoryItem.unit || undefined,
          quantity: Number(newInventoryItem.quantity) || 0,
          minThreshold: Number(newInventoryItem.minThreshold) || 0,
        },
      ]);
      setNewInventoryItem({ name: '', barcode: '', unit: '', quantity: '0', minThreshold: '0' });
      return;
    }
    if (!token || !siteId) return;
    try {
      await createInventoryItem(token, {
        siteId,
        name: newInventoryItem.name.trim(),
        barcode: newInventoryItem.barcode || undefined,
        unit: newInventoryItem.unit || undefined,
        quantity: Number(newInventoryItem.quantity) || 0,
        minThreshold: Number(newInventoryItem.minThreshold) || 0,
      });
      setNewInventoryItem({ name: '', barcode: '', unit: '', quantity: '0', minThreshold: '0' });
      loadSiteExtras(siteId);
      notify('Article ajouté');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Impossible d’ajouter', 'error');
    }
  };

  const adjustInventory = async (itemId: string, delta: number) => {
    if (!token || !siteId) return;
    await adjustInventoryItem(token, itemId, delta).catch(() => {});
    loadSiteExtras(siteId);
  };

  const removeInventoryItem = async (itemId: string) => {
    if (!token || !siteId) return;
    await deleteInventoryItem(token, itemId).catch(() => {});
    loadSiteExtras(siteId);
  };

  const removeStagedInventoryItem = (index: number) => {
    setStagedInventory((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSendPlanning = async () => {
    if (!token || !siteId) return;
    if (!form.contactEmail) {
      notify("Renseignez d'abord un email de contact pour ce site.", 'error');
      return;
    }
    setSendingPlanning(true);
    try {
      const result = await sendSitePlanning(token, siteId, Number(planningPeriodWeeks) || 4);
      notify(`Planning envoyé à ${result.to} (${result.count} intervention(s))`);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Impossible d'envoyer le planning.", 'error');
    } finally {
      setSendingPlanning(false);
    }
  };

  const printQrCode = () => {
    if (!qrCode) return;
    const win = window.open('', '_blank', 'width=420,height=520');
    if (!win) return;
    win.document.write(`
      <html>
        <head><title>QR code — ${form.name}</title></head>
        <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:sans-serif;">
          <h3>${form.name}</h3>
          <img src="${qrCode.qrCodeDataUrl}" alt="QR code de pointage" style="width:280px;height:280px;" />
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
  };

  const openCreateForm = () => {
    setForm(INITIAL_FORM);
    setSelectedSupervisors([]);
    setAddressSelected(false);
    setActiveTab('general');
    setMaxUnlockedIndex(0);
    setStagedCategories([]);
    setStagedContracts([]);
    setStagedZones([]);
    setStagedInventory([]);
    setStagedPlanImage(null);
    setStagedChecklistDraft({});
    setFormVisible(true);
  };

  const tabs = isEdit
    ? [...CREATE_TABS, ...EDIT_ONLY_TABS].map((t) => (t.id === 'contracts' ? { ...t, label: 'Contrats & qualité' } : t))
    : CREATE_TABS.map((tab, index) => ({ ...tab, disabled: index > maxUnlockedIndex }));
  const currentStepIndex = CREATE_TABS.findIndex((t) => t.id === activeTab);

  return (
    <div>
      <div className="page-header">
        <span className="pill">Sites</span>
        <h2>{isEdit ? 'Modifier un site' : 'Nouveau site'}</h2>
        <p>Ajustez les informations, superviseurs et moyens logistiques d’un site.</p>
        <Button type="button" icon={isEdit ? Pencil : Plus} onClick={openCreateForm}>
          {isEdit ? 'Modifier' : 'Créer un site'}
        </Button>
      </div>
      {error && <p className="form-error">{error}</p>}
      <SitesTable />
      {loading ? (
        <p>Chargement des informations...</p>
      ) : (
        <Modal open={formVisible} onClose={() => setFormVisible(false)} maxWidth={900} labelledBy="site-form-title">
          <ModalHeader
            eyebrow="Site"
            title={isEdit ? 'Modifier un site' : 'Nouveau site'}
            titleId="site-form-title"
            onClose={() => setFormVisible(false)}
            actions={
              <Button
                type="button"
                variant="ghost"
                icon={RotateCcw}
                onClick={() => {
                  setForm(INITIAL_FORM);
                  if (!isEdit) {
                    setActiveTab('general');
                    setMaxUnlockedIndex(0);
                    setStagedCategories([]);
                    setStagedContracts([]);
                    setStagedZones([]);
                    setStagedInventory([]);
                    setStagedPlanImage(null);
                    setStagedChecklistDraft({});
                  }
                }}
              >
                Réinitialiser
              </Button>
            }
          />
          <ModalBody>
            <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
            <form className="form-card" onSubmit={handleSubmit} style={{ boxShadow: 'none', padding: 0 }}>
              <TabPanel active={activeTab === 'general'}>
                <Input
                  id="name"
                  name="name"
                  label="Nom du site"
                  placeholder="Boutique Rue du Rhône"
                  required
                  value={form.name}
                  onChange={handleChange}
                />
                <Input
                  id="address"
                  name="address"
                  label="Adresse"
                  placeholder="Rue, ville, pays"
                  required
                  value={form.address}
                  onChange={handleChange}
                  helperText={
                    mapboxToken ? addressError || (addressLoading ? 'Recherche en cours…' : undefined) : undefined
                  }
                />
                {mapboxToken && addressSuggestions.length > 0 && (
                  <div className="address-suggestions">
                    {addressSuggestions.map((suggestion) => (
                      <button
                        key={suggestion.id}
                        type="button"
                        onClick={() => handleAddressSelection(suggestion)}
                      >
                        <strong>{suggestion.label}</strong>
                        {(suggestion.latitude !== undefined || suggestion.longitude !== undefined) && (
                          <span>
                            {suggestion.latitude !== undefined && `Lat ${suggestion.latitude.toFixed(4)}`}
                            {suggestion.latitude !== undefined && suggestion.longitude !== undefined && ' · '}
                            {suggestion.longitude !== undefined && `Lon ${suggestion.longitude.toFixed(4)}`}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {addressSelected && (form.latitude || form.longitude) && (
                  <small className="form-helper">
                    Coordonnées GPS enregistrées automatiquement (lat/lon) avec l’adresse choisie.
                  </small>
                )}
                <Input
                  id="timeWindow"
                  name="timeWindow"
                  label="Fenêtre horaire standard"
                  placeholder="06h00 – 09h00"
                  value={form.timeWindow}
                  onChange={handleChange}
                />
                {(form.latitude || form.longitude) && (
                  <div className="form-field">
                    <span>Coordonnées détectées</span>
                    <small>
                      {form.latitude && `Latitude : ${form.latitude}`}
                      {form.latitude && form.longitude ? ' · ' : ''}
                      {form.longitude && `Longitude : ${form.longitude}`}
                    </small>
                  </div>
                )}
                <Select
                  id="active"
                  name="active"
                  label="Statut"
                  options={STATUS_OPTIONS}
                  value={form.active}
                  onChange={handleChange}
                />
              </TabPanel>

              <TabPanel active={activeTab === 'access'}>
                <Input
                  id="accessInstructions"
                  name="accessInstructions"
                  label="Instructions d'accès"
                  placeholder="Entrée par le parking sous-sol, badge requis…"
                  value={form.accessInstructions}
                  onChange={handleChange}
                />
                <Input
                  id="accessCode"
                  name="accessCode"
                  label="Code d'accès"
                  placeholder="4821B"
                  value={form.accessCode}
                  onChange={handleChange}
                />
                <Input
                  id="contactName"
                  name="contactName"
                  label="Contact sur place"
                  placeholder="Nom du contact"
                  value={form.contactName}
                  onChange={handleChange}
                />
                <Input
                  id="contactPhone"
                  name="contactPhone"
                  label="Téléphone du contact"
                  placeholder="+33 6 00 00 00 00"
                  value={form.contactPhone}
                  onChange={handleChange}
                />
                <Input
                  id="contactEmail"
                  name="contactEmail"
                  label="Email du contact (pour l'envoi du planning)"
                  type="email"
                  placeholder="contact@client.fr"
                  value={form.contactEmail}
                  onChange={handleChange}
                />

                <ChipGroup
                  multiple
                  label="Superviseurs associés"
                  options={supervisors.map((s) => ({ value: s.id, label: s.name }))}
                  value={selectedSupervisors}
                  onChange={setSelectedSupervisors}
                  helperText={supervisors.length === 0 ? 'Aucun superviseur disponible' : undefined}
                />

                {isEdit && siteId && (
                  <div className="form-field">
                    <span>Envoyer le planning au client</span>
                    <small className="form-helper">
                      Envoie par email (avec pièce jointe .ics) les interventions déjà planifiées des prochaines
                      semaines. Seules les interventions réelles sont envoyées, jamais une proposition en attente
                      de validation.
                    </small>
                    <div className="form-row" style={{ marginTop: '0.5rem' }}>
                      <Select
                        id="planningPeriodWeeks"
                        name="planningPeriodWeeks"
                        label="Période"
                        options={[
                          { value: '2', label: '2 semaines' },
                          { value: '4', label: '4 semaines' },
                          { value: '8', label: '8 semaines' },
                        ]}
                        value={planningPeriodWeeks}
                        onChange={(e) => setPlanningPeriodWeeks(e.target.value)}
                      />
                      <Button
                        type="button"
                        icon={Send}
                        onClick={handleSendPlanning}
                        loading={sendingPlanning}
                        disabled={!form.contactEmail}
                      >
                        Envoyer le planning
                      </Button>
                    </div>
                    {!form.contactEmail && (
                      <small className="form-helper">
                        Ajoutez un email de contact ci-dessus pour activer l'envoi.
                      </small>
                    )}
                  </div>
                )}

                <div className="form-field">
                  <span>Photos du site</span>
                  <PhotoGrid
                    images={sitePhotos}
                    onAdd={handleSitePhotosUpload}
                    onRemove={(index) => setSitePhotos((prev) => prev.filter((_, i) => i !== index))}
                  />
                </div>
              </TabPanel>

              <TabPanel active={activeTab === 'gps'}>
                <div className="form-field">
                  <span>Règles de pointage — surcharge pour ce site (facultatif, sinon réglage global)</span>
                </div>
                <Input
                  id="gpsDistanceMeters"
                  name="gpsDistanceMeters"
                  label="Distance tolérée autour du site (mètres)"
                  type="number"
                  placeholder="ex. 100"
                  value={form.gpsDistanceMeters}
                  onChange={handleChange}
                />
                <Input
                  id="toleranceMinutes"
                  name="toleranceMinutes"
                  label="Tolérance de retard (minutes)"
                  type="number"
                  placeholder="ex. 10"
                  value={form.toleranceMinutes}
                  onChange={handleChange}
                />
                <Input
                  id="minimumDurationMinutes"
                  name="minimumDurationMinutes"
                  label="Durée minimale de pointage (minutes)"
                  type="number"
                  placeholder="ex. 15"
                  value={form.minimumDurationMinutes}
                  onChange={handleChange}
                />
              </TabPanel>

              <TabPanel active={activeTab === 'categories'}>
                  {!isEdit && (
                    <small className="form-helper">
                      Étape facultative — vous pouvez continuer sans rien ajouter ici.
                    </small>
                  )}
                  <div className="ui-field-array">
                    {isEdit ? (
                      <>
                        {siteCategories.length === 0 && (
                          <p className="ui-field-array__empty">Aucune catégorie associée à ce site pour l'instant.</p>
                        )}
                        {siteCategories.map((sc) => (
                          <div key={sc.id} className="ui-field-array__row">
                            <div className="ui-field-array__row-content">
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <strong>{sc.category.label}</strong>
                                <span className="card__meta">
                                  {sc.startTime}–{sc.endTime}
                                </span>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                {sc.checklist.length === 0 && (
                                  <small className="form-helper">Aucune tâche définie pour cette catégorie.</small>
                                )}
                                {sc.checklist.map((item) => (
                                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                                    <span>• {item.label}</span>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      className="btn--compact"
                                      icon={Trash2}
                                      onClick={() => handleRemoveCategoryChecklistItem(sc.id, item.id)}
                                    >
                                      Retirer
                                    </Button>
                                  </div>
                                ))}
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                  <Input
                                    label=""
                                    placeholder="Ex. Laver les vitres extérieures"
                                    value={newChecklistLabelByCategory[sc.id] ?? ''}
                                    onChange={(event) =>
                                      setNewChecklistLabelByCategory((prev) => ({ ...prev, [sc.id]: event.target.value }))
                                    }
                                  />
                                  <Button type="button" className="btn--compact" icon={Plus} onClick={() => handleAddCategoryChecklistItem(sc.id)}>
                                    Ajouter
                                  </Button>
                                </div>
                              </div>
                            </div>
                            <Button type="button" variant="ghost" className="btn--compact" icon={Trash2} onClick={() => handleRemoveSiteCategory(sc.id)}>
                              Retirer
                            </Button>
                          </div>
                        ))}
                      </>
                    ) : (
                      <>
                        {stagedCategories.length === 0 && (
                          <p className="ui-field-array__empty">Aucune catégorie ajoutée pour l'instant.</p>
                        )}
                        {stagedCategories.map((cat, index) => (
                          <div key={index} className="ui-field-array__row">
                            <div className="ui-field-array__row-content">
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <strong>{cat.label}</strong>
                                <span className="card__meta">
                                  {cat.startTime}–{cat.endTime}
                                </span>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                {cat.checklist.length === 0 && (
                                  <small className="form-helper">Aucune tâche définie pour cette catégorie.</small>
                                )}
                                {cat.checklist.map((label, itemIndex) => (
                                  <div key={itemIndex} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                                    <span>• {label}</span>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      className="btn--compact"
                                      icon={Trash2}
                                      onClick={() => removeStagedChecklistItem(index, itemIndex)}
                                    >
                                      Retirer
                                    </Button>
                                  </div>
                                ))}
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                  <Input
                                    label=""
                                    placeholder="Ex. Laver les vitres extérieures"
                                    value={stagedChecklistDraft[index] ?? ''}
                                    onChange={(event) =>
                                      setStagedChecklistDraft((prev) => ({ ...prev, [index]: event.target.value }))
                                    }
                                  />
                                  <Button type="button" className="btn--compact" icon={Plus} onClick={() => addStagedChecklistItem(index)}>
                                    Ajouter
                                  </Button>
                                </div>
                              </div>
                            </div>
                            <Button type="button" variant="ghost" className="btn--compact" icon={Trash2} onClick={() => removeStagedCategory(index)}>
                              Retirer
                            </Button>
                          </div>
                        ))}
                      </>
                    )}
                    <div className="form-row">
                      <Select
                        label="Catégorie"
                        options={[
                          { value: '', label: 'Sélectionner une catégorie' },
                          ...categoryCatalog
                            .filter((c) => !(isEdit ? siteCategories : stagedCategories).some((sc) => sc.categoryId === c.id))
                            .map((c) => ({ value: c.id, label: c.label })),
                        ]}
                        value={newSiteCategory.categoryId}
                        onChange={(e) => setNewSiteCategory((prev) => ({ ...prev, categoryId: e.target.value }))}
                      />
                      <Input
                        label="Début"
                        type="time"
                        value={newSiteCategory.startTime}
                        onChange={(e) => setNewSiteCategory((prev) => ({ ...prev, startTime: e.target.value }))}
                      />
                      <Input
                        label="Fin"
                        type="time"
                        value={newSiteCategory.endTime}
                        onChange={(e) => setNewSiteCategory((prev) => ({ ...prev, endTime: e.target.value }))}
                      />
                      <Button
                        type="button"
                        icon={Plus}
                        onClick={handleAddSiteCategory}
                        loading={categoryBusy}
                        disabled={!newSiteCategory.categoryId}
                      >
                        Ajouter
                      </Button>
                    </div>
                  </div>
              </TabPanel>

              {isEdit && siteId && (
                <TabPanel active={activeTab === 'roster'}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {roster &&
                      [1, 2, 3, 4, 5, 6, 0].map((day) => {
                        const entries = roster[String(day)] ?? [];
                        if (!entries.length) return null;
                        return (
                          <div key={day} style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}>
                            <strong style={{ minWidth: '90px' }}>{DAY_LABELS[day]}</strong>
                            <span className="card__meta">
                              {entries.map((e) => `${e.agentName} (${e.startTime}–${e.endTime}, ${e.templateLabel})`).join(', ')}
                            </span>
                          </div>
                        );
                      })}
                    {roster && Object.values(roster).every((entries) => entries.length === 0) && (
                      <small className="form-helper">
                        Aucun gabarit actif ne couvre ce site — l'équipe apparaîtra ici une fois un gabarit créé pour ce site.
                      </small>
                    )}
                  </div>
                </TabPanel>
              )}

              <TabPanel active={activeTab === 'contracts'}>
                  {!isEdit && (
                    <small className="form-helper">
                      Étape facultative — vous pouvez continuer sans rien ajouter ici.
                    </small>
                  )}
                  <div className="form-field">
                    <span>Contrats / SLA</span>
                    <div className="ui-field-array" style={{ marginTop: '0.5rem' }}>
                      {isEdit ? (
                        <>
                          {contracts.length === 0 && <p className="ui-field-array__empty">Aucun contrat enregistré.</p>}
                          {contracts.map((contract) => {
                            const expiringSoon = new Date(contract.endDate).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000;
                            return (
                              <div key={contract.id} className="ui-field-array__row">
                                <span style={expiringSoon ? { color: 'var(--color-danger)' } : undefined}>
                                  {contract.label} · {contract.startDate.slice(0, 10)} → {contract.endDate.slice(0, 10)}
                                </span>
                                <Button type="button" variant="ghost" className="btn--compact" icon={Trash2} onClick={() => removeContract(contract.id)}>
                                  Retirer
                                </Button>
                              </div>
                            );
                          })}
                        </>
                      ) : (
                        <>
                          {stagedContracts.length === 0 && <p className="ui-field-array__empty">Aucun contrat ajouté.</p>}
                          {stagedContracts.map((contract, index) => (
                            <div key={index} className="ui-field-array__row">
                              <span>
                                {contract.label} · {contract.startDate} → {contract.endDate}
                              </span>
                              <Button type="button" variant="ghost" className="btn--compact" icon={Trash2} onClick={() => removeStagedContract(index)}>
                                Retirer
                              </Button>
                            </div>
                          ))}
                        </>
                      )}
                      <div className="form-row">
                        <Input
                          label="Libellé"
                          value={newContract.label}
                          onChange={(event) => setNewContract((prev) => ({ ...prev, label: event.target.value }))}
                        />
                        <Input
                          type="date"
                          label="Début"
                          value={newContract.startDate}
                          onChange={(event) => setNewContract((prev) => ({ ...prev, startDate: event.target.value }))}
                        />
                        <Input
                          type="date"
                          label="Fin"
                          value={newContract.endDate}
                          onChange={(event) => setNewContract((prev) => ({ ...prev, endDate: event.target.value }))}
                        />
                        <Button type="button" icon={Plus} onClick={submitContract}>
                          Ajouter
                        </Button>
                      </div>
                    </div>
                  </div>

                  {qualityScore && (
                    <div className="form-field">
                      <span>Qualité (90 derniers jours)</span>
                      <div className="detail-grid" style={{ marginTop: '0.5rem' }}>
                        <div className="detail-grid__item">
                          <span>Score</span>
                          <strong>{qualityScore.score} / 100</strong>
                        </div>
                        <div className="detail-grid__item">
                          <span>Interventions</span>
                          <strong>
                            {qualityScore.interventionsCompleted} / {qualityScore.interventionsTotal}
                          </strong>
                        </div>
                        <div className="detail-grid__item">
                          <span>No-show</span>
                          <strong>{qualityScore.noShowCount}</strong>
                        </div>
                        <div className="detail-grid__item">
                          <span>Anomalies</span>
                          <strong>{qualityScore.anomalyCount}</strong>
                        </div>
                      </div>
                      {incidents.length > 0 && (
                        <ul className="list-line" style={{ marginTop: '0.5rem' }}>
                          {incidents.slice(0, 5).map((incident) => (
                            <li key={incident.id}>
                              {incident.interventionDate.slice(0, 10)} · {incident.type} — {incident.description}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
              </TabPanel>

              <TabPanel active={activeTab === 'zones'}>
                  {!isEdit && (
                    <small className="form-helper">
                      Étape facultative — vous pouvez continuer sans rien ajouter ici.
                    </small>
                  )}
                  {(isEdit ? planImageUrl : stagedPlanImage) && (
                    <img
                      src={isEdit ? planImageUrl! : stagedPlanImage!}
                      alt="Plan des locaux"
                      style={{ maxWidth: '100%', borderRadius: '8px' }}
                    />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) handlePlanUpload(file);
                    }}
                  />
                  <div className="ui-field-array">
                    {isEdit ? (
                      <>
                        {zones.length === 0 && <p className="ui-field-array__empty">Aucune zone définie.</p>}
                        {zones.map((zone) => (
                          <div key={zone.id} className="ui-field-array__row">
                            <Checkbox
                              checked={zone.completed}
                              onChange={() => toggleZoneCompleted(zone)}
                              label={`${zone.label}${zone.floor ? ` (${zone.floor})` : ''}`}
                            />
                            <Button type="button" variant="ghost" className="btn--compact" icon={Trash2} onClick={() => removeZone(zone.id)}>
                              Retirer
                            </Button>
                          </div>
                        ))}
                      </>
                    ) : (
                      <>
                        {stagedZones.length === 0 && <p className="ui-field-array__empty">Aucune zone ajoutée.</p>}
                        {stagedZones.map((zone, index) => (
                          <div key={index} className="ui-field-array__row">
                            <span>{zone.label}{zone.floor ? ` (${zone.floor})` : ''}</span>
                            <Button type="button" variant="ghost" className="btn--compact" icon={Trash2} onClick={() => removeStagedZone(index)}>
                              Retirer
                            </Button>
                          </div>
                        ))}
                      </>
                    )}
                    <div className="form-row">
                      <Input
                        label="Zone"
                        placeholder="Bâtiment A"
                        value={newZone.label}
                        onChange={(event) => setNewZone((prev) => ({ ...prev, label: event.target.value }))}
                      />
                      <Input
                        label="Étage"
                        placeholder="RDC"
                        value={newZone.floor}
                        onChange={(event) => setNewZone((prev) => ({ ...prev, floor: event.target.value }))}
                      />
                      <Button type="button" icon={Plus} onClick={submitZone}>
                        Ajouter
                      </Button>
                    </div>
                  </div>
              </TabPanel>

              <TabPanel active={activeTab === 'inventory'}>
                  {!isEdit && (
                    <small className="form-helper">
                      Étape facultative — vous pouvez continuer sans rien ajouter ici.
                    </small>
                  )}
                  <div className="table-wrapper">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Article</th>
                          <th>Code-barres</th>
                          <th>Quantité</th>
                          <th>Seuil</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {isEdit ? (
                          <>
                            {inventory.map((item) => {
                              const low = item.quantity <= item.minThreshold;
                              return (
                                <tr key={item.id}>
                                  <td>{item.name}</td>
                                  <td>{item.barcode || '—'}</td>
                                  <td style={low ? { color: 'var(--color-danger)', fontWeight: 600 } : undefined}>
                                    {item.quantity} {item.unit}
                                  </td>
                                  <td>{item.minThreshold}</td>
                                  <td>
                                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                                      <Button type="button" variant="ghost" className="btn--compact" icon={Minus} onClick={() => adjustInventory(item.id, -1)}>
                                        -1
                                      </Button>
                                      <Button type="button" variant="ghost" className="btn--compact" icon={Plus} onClick={() => adjustInventory(item.id, 1)}>
                                        +1
                                      </Button>
                                      <Button type="button" variant="ghost" className="btn--compact" icon={Trash2} onClick={() => removeInventoryItem(item.id)}>
                                        Retirer
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                            {inventory.length === 0 && (
                              <tr>
                                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-muted)' }}>
                                  Aucun article enregistré.
                                </td>
                              </tr>
                            )}
                          </>
                        ) : (
                          <>
                            {stagedInventory.map((item, index) => (
                              <tr key={index}>
                                <td>{item.name}</td>
                                <td>{item.barcode || '—'}</td>
                                <td>
                                  {item.quantity} {item.unit}
                                </td>
                                <td>{item.minThreshold}</td>
                                <td>
                                  <Button type="button" variant="ghost" className="btn--compact" icon={Trash2} onClick={() => removeStagedInventoryItem(index)}>
                                    Retirer
                                  </Button>
                                </td>
                              </tr>
                            ))}
                            {stagedInventory.length === 0 && (
                              <tr>
                                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-muted)' }}>
                                  Aucun article ajouté.
                                </td>
                              </tr>
                            )}
                          </>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="form-row">
                    <Input
                      label="Article"
                      placeholder="Sacs poubelle"
                      value={newInventoryItem.name}
                      onChange={(event) => setNewInventoryItem((prev) => ({ ...prev, name: event.target.value }))}
                    />
                    <Input
                      label="Code-barres"
                      value={newInventoryItem.barcode}
                      onChange={(event) => setNewInventoryItem((prev) => ({ ...prev, barcode: event.target.value }))}
                    />
                    <Input
                      label="Unité"
                      placeholder="unité"
                      value={newInventoryItem.unit}
                      onChange={(event) => setNewInventoryItem((prev) => ({ ...prev, unit: event.target.value }))}
                    />
                    <Input
                      label="Quantité"
                      type="number"
                      value={newInventoryItem.quantity}
                      onChange={(event) => setNewInventoryItem((prev) => ({ ...prev, quantity: event.target.value }))}
                    />
                    <Input
                      label="Seuil min."
                      type="number"
                      value={newInventoryItem.minThreshold}
                      onChange={(event) => setNewInventoryItem((prev) => ({ ...prev, minThreshold: event.target.value }))}
                    />
                    <Button type="button" icon={Plus} onClick={submitInventoryItem}>
                      Ajouter
                    </Button>
                  </div>
              </TabPanel>

              {isEdit && siteId && (
                <TabPanel active={activeTab === 'qr'}>
                  {qrCode ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <img src={qrCode.qrCodeDataUrl} alt="QR code de pointage" style={{ width: '140px', height: '140px' }} />
                      <Button type="button" variant="ghost" icon={Printer} onClick={printQrCode}>
                        Imprimer
                      </Button>
                    </div>
                  ) : (
                    <p className="ui-field-array__empty">QR code non disponible pour ce site.</p>
                  )}
                </TabPanel>
              )}

              {isEdit ? (
                <div className="form-actions">
                  <Button type="submit" icon={Save} loading={submitting} disabled={isInvalid}>
                    Mettre à jour
                  </Button>
                  <Button type="button" variant="ghost" icon={X} onClick={() => navigate('/sites')}>
                    Annuler
                  </Button>
                </div>
              ) : (
                <div className="form-actions" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    {currentStepIndex > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        icon={ChevronLeft}
                        onClick={() => setActiveTab(CREATE_TABS[currentStepIndex - 1].id)}
                      >
                        Précédent
                      </Button>
                    )}
                    {currentStepIndex < CREATE_TABS.length - 1 ? (
                      <Button
                        type="button"
                        icon={ChevronRight}
                        iconPosition="right"
                        disabled={!isStepValid(activeTab)}
                        onClick={() => {
                          const nextIndex = currentStepIndex + 1;
                          setMaxUnlockedIndex((m) => Math.max(m, nextIndex));
                          setActiveTab(CREATE_TABS[nextIndex].id);
                        }}
                      >
                        Continuer
                      </Button>
                    ) : (
                      <Button type="submit" icon={Plus} loading={submitting} disabled={isInvalid}>
                        Créer le site
                      </Button>
                    )}
                    <Button type="button" variant="ghost" icon={X} onClick={() => navigate('/sites')}>
                      Annuler
                    </Button>
                  </div>
                  {activeTab === 'general' && !isStepValid('general') && (
                    <small className="form-helper">Renseignez le nom et l'adresse pour continuer.</small>
                  )}
                </div>
              )}
            </form>
          </ModalBody>
        </Modal>
      )}
    </div>
  );
};
