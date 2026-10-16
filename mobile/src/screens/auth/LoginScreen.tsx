import React, { useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Header } from '@/components/ui/Header';
import { useAuth } from '@/hooks/useAuth';
import { theme } from '@/config/theme';
import { AuthStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const { login, loading, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async () => {
    try {
      const response = await login(email, password);
      if (!response) {
        return;
      }
    } catch {
      // handled by hook error state
    }
  };

  return (
    <View style={styles.container}>
      <Image source={require('../../../assets/images/logo-full.png')} style={styles.logo} resizeMode="contain" />
      <Header title="Connexion" subtitle="Accédez à vos missions et pointages du jour." accent="" />
      <Card style={styles.card}>
        {error && <Text style={styles.error}>{error}</Text>}
        <Input
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="username"
          autoComplete="email"
        />
        <Input label="Mot de passe" value={password} onChangeText={setPassword} secureTextEntry />
        <Button
          fullWidth
          variant="primary"
          title={loading ? 'Connexion...' : 'Se connecter'}
          icon="log-in-outline"
          onPress={handleSubmit}
          disabled={loading || !email || !password}
        />
        <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')}>
          <Text style={styles.link}>Mot de passe oublié</Text>
        </TouchableOpacity>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  logo: {
    width: 260,
    height: (260 * 1024) / 1536,
    borderRadius: 18,
    alignSelf: 'center',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.xl,
    backgroundColor: theme.colors.cream,
    gap: theme.spacing.lg,
  },
  card: {
    gap: theme.spacing.md,
  },
  link: {
    marginTop: theme.spacing.sm,
    color: theme.colors.muted,
    textAlign: 'center',
  },
  error: {
    color: theme.colors.danger,
  },
});
